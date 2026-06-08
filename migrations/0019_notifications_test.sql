-- pgTap test for 0019 — notification emit (transitions + comments) + RLS. Paste into
-- the Supabase SQL editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0019_notifications.sql applied first.
--
-- Proven hosted pattern: temp _t + grant insert on _t to authenticated + plan()
-- before any role switch; act via `set local role authenticated` + a jwt-claims GUC,
-- switching users by re-setting the claim; drop to `set local role postgres` (not
-- reset) to read true state; aggregate via union all; is_empty/isnt_empty for reads.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner) ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000019', 'notif_agency@test.local'),
  ('60000000-0000-0000-0000-000000000019', 'notif_client@test.local');

insert into public.agency (id, name)
values ('a0000000-0000-0000-0000-000000000019', 'Notif Test Agency');

insert into public.client (id, agency_id, name)
values ('c0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000019', 'Notif Client');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000019', 'agency', 'a0000000-0000-0000-0000-000000000019', 'agency_admin'),
  ('60000000-0000-0000-0000-000000000019', 'client', 'c0000000-0000-0000-0000-000000000019', 'client_approver');

-- Portal-enabled contact whose email matches the client user (so _portal_user_ids resolves them).
insert into public.client_contact (id, client_id, first_name, email, portal_access)
values ('cc000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000019', 'Client', 'notif_client@test.local', true);

-- Posts: one internal_review (→ client_review), one client_review (→ approve), one draft.
insert into public.content_item (id, client_id, status, title) values
  ('11000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000019', 'internal_review', 'Post one'),
  ('11000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000019', 'client_review',   'Post two'),
  ('11000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000019', 'draft',            'Post three');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;

select plan(8);

set local role authenticated;

-- ---------- agency acts ----------
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000019","role":"authenticated"}';
select public.transition_post('11000000-0000-0000-0000-000000000001', 'approve_internal'); -- → client_review (notify portal)
select public.add_comment('11000000-0000-0000-0000-000000000002', 'Agency note on a client_review post'); -- visible → notify portal
select public.add_comment('11000000-0000-0000-0000-000000000003', 'Agency note on a draft');             -- not visible → no notify
select public.transition_post('11000000-0000-0000-0000-000000000003', 'submit_internal');  -- draft → internal_review (no notify)

-- ---------- client acts ----------
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000019","role":"authenticated"}';
select public.add_comment('11000000-0000-0000-0000-000000000002', 'Client note while in client_review'); -- client → notify agency
select public.transition_post('11000000-0000-0000-0000-000000000002', 'approve'); -- → approved (notify agency)

-- 5) RLS: as the client, another user's notifications are invisible.
insert into _t select 5, is_empty(
  $$ select id from public.notification where user_id = '70000000-0000-0000-0000-000000000019' $$,
  'a client sees none of another user''s notifications (RLS)'
);

-- ---------- read true state as the owner ----------
set local role postgres;

-- 1) portal contact notified ready_for_review on reaching client_review.
insert into _t select 1, isnt_empty(
  $$ select id from public.notification
       where user_id = '60000000-0000-0000-0000-000000000019'
         and type = 'ready_for_review'
         and content_item_id = '11000000-0000-0000-0000-000000000001' $$,
  'portal contact notified ready_for_review'
);

-- 2) agency notified approved when the client approves.
insert into _t select 2, isnt_empty(
  $$ select id from public.notification
       where user_id = '70000000-0000-0000-0000-000000000019'
         and type = 'approved'
         and content_item_id = '11000000-0000-0000-0000-000000000002' $$,
  'agency notified approved'
);

-- 3) the actor is never their own recipient (the _notify skip rule, globally).
insert into _t select 3, is_empty(
  $$ select id from public.notification where user_id = actor_id $$,
  'no notification has the actor as its own recipient'
);

-- 4) an internal transition emits nothing (and the agency comment on the draft didn't either).
insert into _t select 4, is_empty(
  $$ select id from public.notification where content_item_id = '11000000-0000-0000-0000-000000000003' $$,
  'no notification for the draft post (internal transition + comment on draft)'
);

-- 6) agency comment on a client-visible post notifies the portal user.
insert into _t select 6, isnt_empty(
  $$ select id from public.notification
       where user_id = '60000000-0000-0000-0000-000000000019'
         and type = 'comment'
         and content_item_id = '11000000-0000-0000-0000-000000000002' $$,
  'agency comment on a client_review post notifies the portal user'
);

-- 7) agency comment on a DRAFT post does NOT notify the portal user (leak prevention).
insert into _t select 7, is_empty(
  $$ select id from public.notification
       where user_id = '60000000-0000-0000-0000-000000000019'
         and type = 'comment'
         and content_item_id = '11000000-0000-0000-0000-000000000003' $$,
  'agency comment on a draft does NOT notify the portal user'
);

-- 8) client comment notifies the agency user.
insert into _t select 8, isnt_empty(
  $$ select id from public.notification
       where user_id = '70000000-0000-0000-0000-000000000019'
         and type = 'comment'
         and content_item_id = '11000000-0000-0000-0000-000000000002' $$,
  'client comment notifies the agency user'
);

-- ---------- emit every TAP line ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

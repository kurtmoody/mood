-- pgTap test for 0023 — enriched notification copy. Paste into the Supabase SQL editor
-- and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0019–0023 applied. Light, since this is copy: confirm the client name AND
-- the post title both land in the notification body for each event type.
--
-- The transitions key off auth.uid(), so we drive the actor via the request.jwt.claims
-- GUC; pgTap and the SECURITY DEFINER functions run as the owner (notification reads
-- bypass RLS, so we see every recipient's row). _t only aggregates the TAP lines.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000023', 'copy_agency@test.local'),
  ('60000000-0000-0000-0000-000000000023', 'copy_client@test.local');

insert into public.agency (id, name) values ('a0000000-0000-0000-0000-000000000023', 'Copy Agency');
insert into public.client (id, agency_id, name) values ('c0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000023', 'Acme Co');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000023', 'agency', 'a0000000-0000-0000-0000-000000000023', 'agency_admin'),
  ('60000000-0000-0000-0000-000000000023', 'client', 'c0000000-0000-0000-0000-000000000023', 'client_approver');

-- Portal contact so ready_for_review has a recipient (the client user).
insert into public.client_contact (id, client_id, first_name, email, portal_access)
values ('cc000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000023', 'Client', 'copy_client@test.local', true);

insert into public.content_item (id, client_id, status, title) values
  ('11000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000023', 'internal_review', 'Launch teaser'),
  ('11000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000023', 'client_review',   'Spring promo'),
  ('11000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000023', 'client_review',   'Summer sale');

create temp table _t (seq int, line text);
select plan(3);

-- agency sends post 1 to the client → ready_for_review to the portal user
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000023","role":"authenticated"}';
select public.transition_post('11000000-0000-0000-0000-000000000001', 'approve_internal');

-- client approves post 2 → approved to the agency; requests changes on post 3 → changes_requested
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000023","role":"authenticated"}';
select public.transition_post('11000000-0000-0000-0000-000000000002', 'approve');
select public.transition_post('11000000-0000-0000-0000-000000000003', 'request_changes', 'please tweak the caption');

-- 1) ready_for_review body has client name + title.
insert into _t select 1, isnt_empty(
  $$ select 1 from public.notification
      where type = 'ready_for_review' and content_item_id = '11000000-0000-0000-0000-000000000001'
        and body like '%Acme Co%' and body like '%Launch teaser%' $$,
  'ready_for_review body contains client name and title'
);

-- 2) approved body has client name + title.
insert into _t select 2, isnt_empty(
  $$ select 1 from public.notification
      where type = 'approved' and content_item_id = '11000000-0000-0000-0000-000000000002'
        and body like '%Acme Co%' and body like '%Spring promo%' $$,
  'approved body contains client name and title'
);

-- 3) changes_requested body has client name + title.
insert into _t select 3, isnt_empty(
  $$ select 1 from public.notification
      where type = 'changes_requested' and content_item_id = '11000000-0000-0000-0000-000000000003'
        and body like '%Acme Co%' and body like '%Summer sale%' $$,
  'changes_requested body contains client name and title'
);

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

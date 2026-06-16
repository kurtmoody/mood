-- pgTap test for 0053 — @mention guards on add_comment / add_internal_note.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0053.
--
-- Both RPCs are SECURITY DEFINER and read auth.uid() from the request.jwt.claims GUC, so we
-- stay as the OWNER and only drive the caller via the GUC. Reads of mention/notification run
-- as the owner = true state (mention has RLS with NO policies; notification is own-rows — both
-- would read empty under the authenticated role). Comment vs internal-note notifications are
-- told apart by the body suffix the RPC builds ("…in a comment" / "…in an internal note").

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000053', 'mn_actorA@test.local'),   -- agency A member, the actor
  ('72000000-0000-0000-0000-000000000053', 'mn_secondA@test.local'),  -- agency A member, a colleague
  ('7c000000-0000-0000-0000-000000000053', 'mn_contact@test.local'),  -- client-scope (portal) user of C
  ('8b000000-0000-0000-0000-000000000053', 'mn_strangerB@test.local');-- agency B member (cross-tenant)

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000053', 'MN Agency A'),
  ('b0000000-0000-0000-0000-000000000053', 'MN Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000053', 'a0000000-0000-0000-0000-000000000053', 'MN Client C');

-- A post under C, in a client-visible status so the existing comment logic runs.
insert into public.content_item (id, client_id, title, status) values
  ('e1000000-0000-0000-0000-000000000053', 'ca000000-0000-0000-0000-000000000053', 'MN Post', 'client_review');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000053', 'agency', 'a0000000-0000-0000-0000-000000000053', 'agency_member'),
  ('72000000-0000-0000-0000-000000000053', 'agency', 'a0000000-0000-0000-0000-000000000053', 'agency_member'),
  ('7c000000-0000-0000-0000-000000000053', 'client', 'ca000000-0000-0000-0000-000000000053', 'client_approver'),
  ('8b000000-0000-0000-0000-000000000053', 'agency', 'b0000000-0000-0000-0000-000000000053', 'agency_member');

create temp table _t (seq int, line text);
select plan(11);

-- All calls are made by the actor (agency A member).
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000053","role":"authenticated"}';

-- ===== internal note: a client contact can NEVER be mentioned =====
-- 1) mentioning the portal/client user in an internal note is rejected
insert into _t select 1, throws_ok(
  $$ select public.add_internal_note('post', 'e1000000-0000-0000-0000-000000000053', 'note', array['7c000000-0000-0000-0000-000000000053'::uuid]) $$,
  'P0001'
);

-- mention a fellow agency member in an internal note → succeeds
select public.add_internal_note('post', 'e1000000-0000-0000-0000-000000000053', 'note for second',
  array['72000000-0000-0000-0000-000000000053'::uuid]);

-- 2) a mention row exists for that colleague
insert into _t select 2, isnt_empty(
  $$ select 1 from public.mention where source_type='internal_note' and mentioned_user_id='72000000-0000-0000-0000-000000000053' $$,
  'internal-note mention row recorded for the agency colleague'
);

-- 3) a 'mention' notification exists for that colleague (internal-note variant)
insert into _t select 3, isnt_empty(
  $$ select 1 from public.notification
      where type='mention' and user_id='72000000-0000-0000-0000-000000000053'
        and body like '%mentioned in an internal note' $$,
  'internal-note mention notifies the colleague'
);

-- ===== comment: cross-tenant stranger has no access to this post =====
-- 4) mentioning an agency-B member (no access to C) in a comment is rejected
insert into _t select 4, throws_ok(
  $$ select public.add_comment('e1000000-0000-0000-0000-000000000053', 'hi', array['8b000000-0000-0000-0000-000000000053'::uuid]) $$,
  'P0001'
);

-- mention a fellow agency member in a comment → succeeds
select public.add_comment('e1000000-0000-0000-0000-000000000053', 'comment for second',
  array['72000000-0000-0000-0000-000000000053'::uuid]);

-- 5) a comment mention row exists for the colleague
insert into _t select 5, isnt_empty(
  $$ select 1 from public.mention where source_type='comment' and mentioned_user_id='72000000-0000-0000-0000-000000000053' $$,
  'comment mention row recorded for the agency colleague'
);

-- 6) a 'mention' notification exists for the colleague (comment variant)
insert into _t select 6, isnt_empty(
  $$ select 1 from public.notification
      where type='mention' and user_id='72000000-0000-0000-0000-000000000053'
        and body like '%mentioned in a comment' $$,
  'comment mention notifies the colleague'
);

-- ===== comment: a client contact CAN be mentioned =====
select public.add_comment('e1000000-0000-0000-0000-000000000053', 'comment for contact',
  array['7c000000-0000-0000-0000-000000000053'::uuid]);

-- 7) a comment mention row exists for the contact
insert into _t select 7, isnt_empty(
  $$ select 1 from public.mention where source_type='comment' and mentioned_user_id='7c000000-0000-0000-0000-000000000053' $$,
  'comment mention row recorded for the client contact'
);

-- 8) a 'mention' notification exists for the contact
insert into _t select 8, isnt_empty(
  $$ select 1 from public.notification
      where type='mention' and user_id='7c000000-0000-0000-0000-000000000053'
        and body like '%mentioned in a comment' $$,
  'comment mention notifies the client contact'
);

-- ===== self-mention: the actor is never notified (helper skips the actor) =====
select public.add_comment('e1000000-0000-0000-0000-000000000053', 'self mention',
  array['71000000-0000-0000-0000-000000000053'::uuid]);

-- 9) no 'mention' notification exists for the actor
insert into _t select 9, is_empty(
  $$ select 1 from public.notification where type='mention' and user_id='71000000-0000-0000-0000-000000000053' $$,
  'a self-mention does not notify the actor'
);

-- ===== backward-compat: no mentions = comment created, zero mention rows =====
select public.add_comment('e1000000-0000-0000-0000-000000000053', 'MN-NO-MENTION-MARKER');

-- 10) the comment was created
insert into _t select 10, isnt_empty(
  $$ select 1 from public.comment where content_item_id='e1000000-0000-0000-0000-000000000053' and body='MN-NO-MENTION-MARKER' $$,
  'a comment with no mentions is still created'
);

-- 11) it produced no mention rows
insert into _t select 11, is_empty(
  $$ select 1 from public.mention
      where source_type='comment'
        and source_id in (select id from public.comment
                           where content_item_id='e1000000-0000-0000-0000-000000000053' and body='MN-NO-MENTION-MARKER') $$,
  'a comment with no mentions records no mention rows'
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

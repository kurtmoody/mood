-- pgTap test for 0034 — update_team_member / set_team_member_active authorisation.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0034.
--
-- Both RPCs key off auth.uid() (SECURITY DEFINER); we stay as the owner and drive
-- the caller via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures (agency A owns the member; agency B is the cross-tenant) ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000034', 'tm_adminA@test.local'),
  ('8b000000-0000-0000-0000-000000000034', 'tm_adminB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000034', 'TM Agency A'),
  ('b0000000-0000-0000-0000-000000000034', 'TM Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000034', 'agency', 'a0000000-0000-0000-0000-000000000034', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000034', 'agency', 'b0000000-0000-0000-0000-000000000034', 'agency_admin');

insert into public.team_member (id, agency_id, full_name, role, email, is_active) values
  ('c0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000034', 'Jane Borg', 'Designer', 'jane@a.local', true);

create temp table _t (seq int, line text);
select plan(6);

-- ===== agency A member acts on their own member =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000034","role":"authenticated"}';

-- 1) edit name/role/email
select public.update_team_member(
  'c0000000-0000-0000-0000-000000000034', 'Jane Vella', 'Senior Designer', 'jane.vella@a.local', true);
insert into _t select 1, is(
  (select full_name || '|' || role || '|' || email from public.team_member
     where id = 'c0000000-0000-0000-0000-000000000034'),
  'Jane Vella|Senior Designer|jane.vella@a.local', 'agency member edits their team member'
);

-- 2) deactivate via the toggle
select public.set_team_member_active('c0000000-0000-0000-0000-000000000034', false);
insert into _t select 2, is(
  (select is_active from public.team_member where id = 'c0000000-0000-0000-0000-000000000034'),
  false, 'toggle deactivates the member'
);

-- 3) reactivate via the toggle
select public.set_team_member_active('c0000000-0000-0000-0000-000000000034', true);
insert into _t select 3, is(
  (select is_active from public.team_member where id = 'c0000000-0000-0000-0000-000000000034'),
  true, 'toggle reactivates the member'
);

-- 4) empty full_name is rejected
insert into _t select 4, throws_ok(
  $$ select public.update_team_member('c0000000-0000-0000-0000-000000000034', '   ', 'x', 'y', true) $$,
  'P0001'
);

-- ===== cross-tenant: agency B admin cannot touch agency A's member =====
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000034","role":"authenticated"}';

-- 5) cannot edit
insert into _t select 5, throws_ok(
  $$ select public.update_team_member('c0000000-0000-0000-0000-000000000034', 'Hacked', null, null, true) $$,
  'P0001'
);

-- 6) cannot deactivate
insert into _t select 6, throws_ok(
  $$ select public.set_team_member_active('c0000000-0000-0000-0000-000000000034', false) $$,
  'P0001'
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

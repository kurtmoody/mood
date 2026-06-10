-- pgTap test for 0036 — delete_team_member (reassign-then-delete) authorisation + transfer.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0036.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000036', 'del_adminA@test.local'),
  ('8b000000-0000-0000-0000-000000000036', 'del_adminB@test.local'),
  ('7c000000-0000-0000-0000-000000000036', 'del_member@test.local'),   -- plain agency_member of A
  ('99000000-0000-0000-0000-000000000036', 'del_login@test.local');    -- the linked login on M_login

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000036', 'Del Agency A'),
  ('b0000000-0000-0000-0000-000000000036', 'Del Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000036', 'agency', 'a0000000-0000-0000-0000-000000000036', 'agency_admin'),
  ('8b000000-0000-0000-0000-000000000036', 'agency', 'b0000000-0000-0000-0000-000000000036', 'agency_admin'),
  ('7c000000-0000-0000-0000-000000000036', 'agency', 'a0000000-0000-0000-0000-000000000036', 'agency_member');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Del Client A');

-- Members of A: M1 (to delete: inactive, no login), SUCC (active successor),
-- M_active (active → can't delete), M_login (inactive but linked login → can't delete).
insert into public.team_member (id, agency_id, full_name, is_active, user_id) values
  ('10000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'M1 Leaver',  false, null),
  ('20000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Successor',  true,  null),
  ('30000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Still Here', true,  null),
  ('40000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Has Login',  false, '99000000-0000-0000-0000-000000000036');
-- A member of agency B (for the cross-agency successor test).
insert into public.team_member (id, agency_id, full_name, is_active) values
  ('50000000-0000-0000-0000-000000000036', 'b0000000-0000-0000-0000-000000000036', 'B Member', true);

-- M1 owns a task, a client_ownership slot, and two RACI cells. SUCC already holds a
-- RACI cell for task_type 'Y' (the merge collision).
insert into public.task (id, agency_id, client_id, title, owner_id) values
  ('81000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036',
   'ca000000-0000-0000-0000-000000000036', 'M1 task', '10000000-0000-0000-0000-000000000036');

insert into public.client_ownership (client_id, lead_pm_id) values
  ('ca000000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000036');

insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value) values
  ('a0000000-0000-0000-0000-000000000036', 'X', '10000000-0000-0000-0000-000000000036', 'R'),
  ('a0000000-0000-0000-0000-000000000036', 'Y', '10000000-0000-0000-0000-000000000036', 'A'),
  ('a0000000-0000-0000-0000-000000000036', 'Y', '20000000-0000-0000-0000-000000000036', 'R'); -- SUCC already has 'Y'

create temp table _t (seq int, line text);
select plan(10);

-- ===== authorisation / state failures (run BEFORE the happy-path delete) =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000036","role":"authenticated"}';

-- 6) cannot delete an active member
insert into _t select 6, throws_ok(
  $$ select public.delete_team_member('30000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036') $$,
  'P0001'
);

-- 7) cannot delete a member with a linked login
insert into _t select 7, throws_ok(
  $$ select public.delete_team_member('40000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036') $$,
  'P0001'
);

-- 8) a non-admin agency member cannot delete
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 8, throws_ok(
  $$ select public.delete_team_member('10000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036') $$,
  'P0001'
);

-- 9) an admin of another agency cannot delete
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 9, throws_ok(
  $$ select public.delete_team_member('10000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036') $$,
  'P0001'
);

-- 10) successor must belong to the same agency (B member rejected)
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 10, throws_ok(
  $$ select public.delete_team_member('10000000-0000-0000-0000-000000000036', '50000000-0000-0000-0000-000000000036') $$,
  'P0001'
);

-- ===== happy path: admin deletes inactive M1, reassigning to SUCC =====
select public.delete_team_member('10000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036');

-- 1) the task now belongs to the successor
insert into _t select 1, is(
  (select owner_id::text from public.task where id = '81000000-0000-0000-0000-000000000036'),
  '20000000-0000-0000-0000-000000000036', 'task reassigned to successor'
);

-- 2) the ownership slot now belongs to the successor
insert into _t select 2, is(
  (select lead_pm_id::text from public.client_ownership where client_id = 'ca000000-0000-0000-0000-000000000036'),
  '20000000-0000-0000-0000-000000000036', 'client_ownership slot reassigned to successor'
);

-- 3) M1's non-colliding RACI cell ('X') moved to the successor
insert into _t select 3, isnt_empty(
  $$ select 1 from public.raci_matrix
       where agency_id='a0000000-0000-0000-0000-000000000036' and task_type='X'
         and team_member_id='20000000-0000-0000-0000-000000000036' $$,
  'RACI cell X moved to successor'
);

-- 4) RACI merge did NOT duplicate: successor holds exactly 2 cells (X moved + Y kept)
insert into _t select 4, is(
  (select count(*)::int from public.raci_matrix
     where agency_id='a0000000-0000-0000-0000-000000000036'
       and team_member_id='20000000-0000-0000-0000-000000000036'),
  2, 'RACI merge leaves successor with no duplicate cell'
);

-- 5) M1 is gone
insert into _t select 5, is(
  (select count(*)::int from public.team_member where id = '10000000-0000-0000-0000-000000000036'),
  0, 'the deleted member is gone'
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

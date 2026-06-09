-- pgTap test for 0032 — set_raci_matrix admin-write authorisation + replace-all.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0027 + 0032.
--
-- set_raci_matrix keys off auth.uid() (SECURITY DEFINER), so we drive the caller via
-- the request.jwt.claims GUC; pgTap + the RPC run as the owner (reads are true-state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures (owner) ----------
insert into auth.users (id, email) values
  ('7a000000-0000-0000-0000-000000000032', 'raci_admin@test.local'),    -- agency_admin of A
  ('7c000000-0000-0000-0000-000000000032', 'raci_member@test.local'),   -- agency_member of A
  ('8b000000-0000-0000-0000-000000000032', 'raci_other@test.local');    -- agency_admin of B

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000032', 'RACI Agency A'),
  ('b0000000-0000-0000-0000-000000000032', 'RACI Agency B');

insert into public.team_member (id, agency_id, full_name) values
  ('d1000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000032', 'Member One'),
  ('d2000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000032', 'Member Two');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('7a000000-0000-0000-0000-000000000032', 'agency', 'a0000000-0000-0000-0000-000000000032', 'agency_admin'),
  ('7c000000-0000-0000-0000-000000000032', 'agency', 'a0000000-0000-0000-0000-000000000032', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000032', 'agency', 'b0000000-0000-0000-0000-000000000032', 'agency_admin');

-- Existing grid for agency A (two cells) — to prove replace-all wipes them.
insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value) values
  ('a0000000-0000-0000-0000-000000000032', 'Old task',   'd1000000-0000-0000-0000-000000000032', 'A'),
  ('a0000000-0000-0000-0000-000000000032', 'Old task 2', 'd2000000-0000-0000-0000-000000000032', 'R');

create temp table _t (seq int, line text);
select plan(4);

-- ===== agency_admin replaces the grid =====
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000032","role":"authenticated"}';
select public.set_raci_matrix(
  'a0000000-0000-0000-0000-000000000032',
  '[{"task_type":"Design execution","team_member_id":"d1000000-0000-0000-0000-000000000032","raci_value":"A/R"}]'::jsonb
);

-- 1) the new cell is present.
insert into _t select 1, isnt_empty(
  $$ select 1 from public.raci_matrix
       where agency_id='a0000000-0000-0000-0000-000000000032'
         and task_type='Design execution'
         and team_member_id='d1000000-0000-0000-0000-000000000032'
         and raci_value='A/R' $$,
  'agency_admin replaces the RACI grid'
);

-- 2) replace-all: the two prior cells are gone, only the one new cell remains.
insert into _t select 2, is(
  (select count(*) from public.raci_matrix where agency_id='a0000000-0000-0000-0000-000000000032')::text,
  '1',
  'set_raci_matrix is replace-all (old cells deleted)'
);

-- 3) a non-admin agency member cannot write.
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000032","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.set_raci_matrix('a0000000-0000-0000-0000-000000000032',
       '[{"task_type":"X","team_member_id":"d1000000-0000-0000-0000-000000000032","raci_value":"C"}]'::jsonb) $$,
  'P0001'
);

-- 4) an admin of another agency cannot write this one.
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000032","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_raci_matrix('a0000000-0000-0000-0000-000000000032',
       '[{"task_type":"X","team_member_id":"d1000000-0000-0000-0000-000000000032","raci_value":"C"}]'::jsonb) $$,
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

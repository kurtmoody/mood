-- pgTap test for 0028 — task RLS + RPC authorisation. Paste into the Supabase SQL
-- editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires the 0005 is_agency_member helper and 0028 applied.
--
-- task is agency-scoped read (RLS) — reads run as `set local role authenticated` + a
-- jwt-claims GUC; the SECURITY DEFINER RPCs work under the same.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (owner) ----------
insert into auth.users (id, email) values
  ('7a000000-0000-0000-0000-000000000028', 'task_a@test.local'),   -- agency A
  ('8b000000-0000-0000-0000-000000000028', 'task_b@test.local');   -- agency B (cross-tenant)

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000028', 'Task Agency A'),
  ('b0000000-0000-0000-0000-000000000028', 'Task Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('7a000000-0000-0000-0000-000000000028', 'agency', 'a0000000-0000-0000-0000-000000000028', 'agency_admin'),
  ('8b000000-0000-0000-0000-000000000028', 'agency', 'b0000000-0000-0000-0000-000000000028', 'agency_admin');

-- A fixture task in agency A (to update / delete / cross-tenant against).
insert into public.task (id, agency_id, title, status) values
  ('71000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000028', 'Fixture task', 'Not Started');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(7);

-- ===== agency A: create + update =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000028","role":"authenticated"}';
select public.create_task(p_task_type => 'Design execution', p_title => 'Created via RPC', p_status => 'In Progress', p_priority => 'High');
select public.update_task(p_task_id => '71000000-0000-0000-0000-000000000001', p_title => 'Fixture task', p_status => 'Complete');

set local role postgres;
-- 1) agency created a task.
insert into _t select 1, isnt_empty(
  $$ select 1 from public.task where agency_id='a0000000-0000-0000-0000-000000000028' and title='Created via RPC' $$,
  'agency creates a task'
);
-- 2) agency updated the fixture task.
insert into _t select 2, is(
  (select status from public.task where id='71000000-0000-0000-0000-000000000001'), 'Complete',
  'agency updates a task'
);

-- 3) agency reads its own agency's tasks (RLS).
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000028","role":"authenticated"}';
insert into _t select 3, isnt_empty(
  $$ select 1 from public.task where agency_id='a0000000-0000-0000-0000-000000000028' $$,
  'agency reads its own tasks'
);

-- ===== cross-tenant agency B =====
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000028","role":"authenticated"}';
-- 4) another agency cannot read these tasks.
insert into _t select 4, is_empty(
  $$ select 1 from public.task where agency_id='a0000000-0000-0000-0000-000000000028' $$,
  'cross-tenant agency cannot read another agency''s tasks'
);
-- 5) another agency cannot update.
insert into _t select 5, throws_ok(
  $$ select public.update_task(p_task_id => '71000000-0000-0000-0000-000000000001', p_title => 'hack') $$, 'P0001'
);
-- 6) another agency cannot delete.
insert into _t select 6, throws_ok(
  $$ select public.delete_task('71000000-0000-0000-0000-000000000001') $$, 'P0001'
);

-- ===== agency A deletes =====
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000028","role":"authenticated"}';
select public.delete_task('71000000-0000-0000-0000-000000000001');

set local role postgres;
-- 7) the task is gone.
insert into _t select 7, is_empty(
  $$ select 1 from public.task where id='71000000-0000-0000-0000-000000000001' $$,
  'agency deletes a task'
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

-- pgTap test for 0043 — task estimated_hours + start_date persist + validation; 0041 intact.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0043.
--
-- create_task/update_task are SECURITY DEFINER (read auth.uid() from the request.jwt.claims
-- GUC); we stay as the owner and drive the caller via the GUC. Reads run as the owner.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000043', 'cap_caller@test.local'),
  ('72000000-0000-0000-0000-000000000043', 'cap_owner@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000043', 'Cap Agency A');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-000000000043', 'Cap Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000043', 'agency', 'a0000000-0000-0000-0000-000000000043', 'agency_member');

insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d2000000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-000000000043', 'Cap Owner', '72000000-0000-0000-0000-000000000043', true);

create temp table _ctx (task_id uuid);
create temp table _t (seq int, line text);
select plan(9);

set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000043","role":"authenticated"}';

-- create with estimate + start/due dates, an owner, and a status
insert into _ctx
  select public.create_task(
    p_client_id       => 'ca000000-0000-0000-0000-000000000043',
    p_task_type       => 'Design execution',
    p_title           => 'Cap task',
    p_owner_id        => 'd2000000-0000-0000-0000-000000000043',
    p_status          => 'Not Started',
    p_due_date        => '2026-07-10',
    p_estimated_hours => 3,
    p_start_date      => '2026-07-01');

-- 1-2) new fields persist on create
insert into _t select 1, is(
  (select estimated_hours from public.task where id=(select task_id from _ctx)),
  3::numeric, 'estimated_hours persists on create');
insert into _t select 2, is(
  (select start_date from public.task where id=(select task_id from _ctx)),
  '2026-07-01'::date, 'start_date persists on create');

-- 3-4) existing behaviour unaffected (owner + status)
insert into _t select 3, is(
  (select owner_id from public.task where id=(select task_id from _ctx)),
  'd2000000-0000-0000-0000-000000000043'::uuid, 'owner unaffected');
insert into _t select 4, is(
  (select status from public.task where id=(select task_id from _ctx)),
  'Not Started', 'status unaffected');

-- 5) 0041 subscription seeding still runs (owner/creator seeded)
insert into _t select 5, isnt_empty(
  $$ select 1 from public.task_subscriber where task_id=(select task_id from _ctx) $$,
  '0041 subscriber seeding preserved');

-- update: change the estimate + start date (keep title/owner/status)
select public.update_task(
  p_task_id         => (select task_id from _ctx),
  p_client_id       => 'ca000000-0000-0000-0000-000000000043',
  p_task_type       => 'Design execution',
  p_title           => 'Cap task',
  p_owner_id        => 'd2000000-0000-0000-0000-000000000043',
  p_status          => 'Not Started',
  p_due_date        => '2026-07-10',
  p_estimated_hours => 5,
  p_start_date      => '2026-07-02');

-- 6-7) new fields persist on update
insert into _t select 6, is(
  (select estimated_hours from public.task where id=(select task_id from _ctx)),
  5::numeric, 'estimated_hours persists on update');
insert into _t select 7, is(
  (select start_date from public.task where id=(select task_id from _ctx)),
  '2026-07-02'::date, 'start_date persists on update');

-- 8) start_date after due_date is rejected
insert into _t select 8, throws_ok(
  $$ select public.create_task(p_title => 'Bad dates', p_due_date => '2026-07-10', p_start_date => '2026-08-01') $$,
  'P0001');

-- 9) negative estimate is rejected
insert into _t select 9, throws_ok(
  $$ select public.create_task(p_title => 'Bad estimate', p_estimated_hours => -1) $$,
  'P0001');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

-- pgTap test for 0045 — task value/visibility/invoice persist + validation; 0041/0043 intact.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0045.
--
-- create_task/update_task are SECURITY DEFINER (read auth.uid() from the request.jwt.claims
-- GUC); we stay as the owner and drive the caller via the GUC. Reads run as the owner.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000045', 'jv_caller@test.local'),
  ('72000000-0000-0000-0000-000000000045', 'jv_owner@test.local'),
  ('8b000000-0000-0000-0000-000000000045', 'jv_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000045', 'JV Agency A'),
  ('b0000000-0000-0000-0000-000000000045', 'JV Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000045', 'a0000000-0000-0000-0000-000000000045', 'JV Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000045', 'agency', 'a0000000-0000-0000-0000-000000000045', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000045', 'agency', 'b0000000-0000-0000-0000-000000000045', 'agency_member');

insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d2000000-0000-0000-0000-000000000045', 'a0000000-0000-0000-0000-000000000045', 'JV Owner', '72000000-0000-0000-0000-000000000045', true);

create temp table _ctx (task_id uuid);
create temp table _t (seq int, line text);
select plan(10);

set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000045","role":"authenticated"}';

-- create with value + visibility + invoice status, an owner, and an estimate (0043 regression)
insert into _ctx
  select public.create_task(
    p_client_id            => 'ca000000-0000-0000-0000-000000000045',
    p_title                => 'Job',
    p_owner_id             => 'd2000000-0000-0000-0000-000000000045',
    p_estimated_hours      => 4,
    p_value                => 500,
    p_value_client_visible => true,
    p_invoice_status       => 'invoiced');

-- 1-3) new fields persist on create
insert into _t select 1, is(
  (select value from public.task where id=(select task_id from _ctx)), 500::numeric, 'value persists on create');
insert into _t select 2, is(
  (select value_client_visible from public.task where id=(select task_id from _ctx)), true, 'value_client_visible persists on create');
insert into _t select 3, is(
  (select invoice_status from public.task where id=(select task_id from _ctx)), 'invoiced', 'invoice_status persists on create');

-- 4) 0043 capacity field still works (estimated_hours)
insert into _t select 4, is(
  (select estimated_hours from public.task where id=(select task_id from _ctx)), 4::numeric, '0043 estimated_hours still persists (regression guard)');

-- 5) 0041 subscriber seeding still runs
insert into _t select 5, isnt_empty(
  $$ select 1 from public.task_subscriber where task_id=(select task_id from _ctx) $$,
  '0041 subscriber seeding preserved (regression guard)');

-- update value + invoice status (keep title/owner)
select public.update_task(
  p_task_id        => (select task_id from _ctx),
  p_title          => 'Job',
  p_owner_id       => 'd2000000-0000-0000-0000-000000000045',
  p_value          => 750,
  p_invoice_status => 'paid');

-- 6-7) new fields persist on update
insert into _t select 6, is(
  (select value from public.task where id=(select task_id from _ctx)), 750::numeric, 'value persists on update');
insert into _t select 7, is(
  (select invoice_status from public.task where id=(select task_id from _ctx)), 'paid', 'invoice_status persists on update');

-- 8) invalid invoice_status is rejected
insert into _t select 8, throws_ok(
  $$ select public.create_task(p_client_id => 'ca000000-0000-0000-0000-000000000045', p_title => 'Bad invoice', p_invoice_status => 'billed') $$,
  'P0001');

-- 9) negative value is rejected
insert into _t select 9, throws_ok(
  $$ select public.create_task(p_client_id => 'ca000000-0000-0000-0000-000000000045', p_title => 'Bad value', p_value => -1) $$,
  'P0001');

-- 10) cross-tenant: agency B member cannot create against agency A's client
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000045","role":"authenticated"}';
insert into _t select 10, throws_ok(
  $$ select public.create_task(p_client_id => 'ca000000-0000-0000-0000-000000000045', p_title => 'Cross', p_value => 100) $$,
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

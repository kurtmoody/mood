-- pgTap test for 0041 — task subscriptions seeding + event notifications.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0041.
--
-- The task RPCs are SECURITY DEFINER and read auth.uid() from the request.jwt.claims GUC,
-- so we stay as the owner and just vary the GUC for the RPC calls + true-state reads. The
-- cross-tenant check tests RLS, so it switches to the authenticated role (owner bypasses
-- RLS); hence grant insert on _t to authenticated and plan() BEFORE the role switch.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000041', 'ts_creator@test.local'),  -- caller/creator + actor
  ('72000000-0000-0000-0000-000000000041', 'ts_owner1@test.local'),   -- first owner
  ('73000000-0000-0000-0000-000000000041', 'ts_leadpm@test.local'),   -- accountable (client Lead PM)
  ('74000000-0000-0000-0000-000000000041', 'ts_manual@test.local'),   -- manual subscriber
  ('75000000-0000-0000-0000-000000000041', 'ts_owner2@test.local'),   -- second owner
  ('8b000000-0000-0000-0000-000000000041', 'ts_agencyB@test.local');  -- cross-tenant

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000041', 'TS Agency A'),
  ('b0000000-0000-0000-0000-000000000041', 'TS Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000041', 'TS Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000041', 'agency', 'a0000000-0000-0000-0000-000000000041', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000041', 'agency', 'b0000000-0000-0000-0000-000000000041', 'agency_member');

-- team_members (owner_id is a team_member id; subscribers resolve via user_id)
insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d2000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000041', 'Owner One', '72000000-0000-0000-0000-000000000041', true),
  ('d3000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000041', 'Lead PM',   '73000000-0000-0000-0000-000000000041', true),
  ('d5000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000041', 'Owner Two', '75000000-0000-0000-0000-000000000041', true);

-- Client's Lead PM = the accountable person.
insert into public.client_ownership (client_id, lead_pm_id) values
  ('ca000000-0000-0000-0000-000000000041', 'd3000000-0000-0000-0000-000000000041');

create temp table _ctx (task_id uuid);
create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(12);

-- ===== create as the creator (71), owner = Owner One =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000041","role":"authenticated"}';
insert into _ctx
  select public.create_task(
    'ca000000-0000-0000-0000-000000000041', 'Caption writing / copy', 'Write copy',
    'd2000000-0000-0000-0000-000000000041', 'Not Started', 'Medium', null, null, null, null);

-- 1-3) seeding: owner / accountable / creator with correct sources
insert into _t select 1, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='72000000-0000-0000-0000-000000000041'),
  'owner', 'owner seeded as source=owner');
insert into _t select 2, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='73000000-0000-0000-0000-000000000041'),
  'accountable', 'accountable (client Lead PM) seeded as source=accountable');
insert into _t select 3, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='71000000-0000-0000-0000-000000000041'),
  'creator', 'creator seeded as source=creator');

-- a MANUAL subscriber (no manual RPC in Phase 1 — insert directly as the owner)
set local role postgres;
insert into public.task_subscriber (task_id, user_id, source)
  values ((select task_id from _ctx), '74000000-0000-0000-0000-000000000041', 'manual');

-- ===== change owner → Owner Two (status unchanged) =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000041","role":"authenticated"}';
select public.update_task(
  (select task_id from _ctx), 'ca000000-0000-0000-0000-000000000041', 'Caption writing / copy', 'Write copy',
  'd5000000-0000-0000-0000-000000000041', 'Not Started', 'Medium', null, null, null, null);

-- 4-7) only the owner row swaps; manual + accountable + creator survive
insert into _t select 4, is_empty(
  $$ select 1 from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='72000000-0000-0000-0000-000000000041' $$,
  'old owner row removed on owner change');
insert into _t select 5, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='75000000-0000-0000-0000-000000000041'),
  'owner', 'new owner seeded as source=owner');
insert into _t select 6, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='73000000-0000-0000-0000-000000000041'),
  'accountable', 'accountable survives owner change');
insert into _t select 7, is(
  (select source from public.task_subscriber where task_id=(select task_id from _ctx) and user_id='74000000-0000-0000-0000-000000000041'),
  'manual', 'manual subscriber survives owner change');

-- ===== status change → In Progress (in-app only) =====
select public.update_task(
  (select task_id from _ctx), 'ca000000-0000-0000-0000-000000000041', 'Caption writing / copy', 'Write copy',
  'd5000000-0000-0000-0000-000000000041', 'In Progress', 'Medium', null, null, null, null);

-- 8) the actor (71) is NOT notified
insert into _t select 8, is(
  (select count(*)::int from public.notification where task_id=(select task_id from _ctx) and type='task_status' and user_id='71000000-0000-0000-0000-000000000041'),
  0, 'a status change does not notify the actor');
-- 9) a subscriber (new owner 75) IS notified
insert into _t select 9, isnt_empty(
  $$ select 1 from public.notification where task_id=(select task_id from _ctx) and type='task_status' and user_id='75000000-0000-0000-0000-000000000041' $$,
  'a status change notifies subscribers');
-- 10) the in-app-only status is marked no-email
insert into _t select 10, is(
  (select email from public.notification where task_id=(select task_id from _ctx) and type='task_status'
     and user_id='75000000-0000-0000-0000-000000000041' and body like '%In Progress%'),
  false, 'In Progress status notification is in-app only (email=false)');

-- ===== status change → Complete (meaningful → email) =====
select public.update_task(
  (select task_id from _ctx), 'ca000000-0000-0000-0000-000000000041', 'Caption writing / copy', 'Write copy',
  'd5000000-0000-0000-0000-000000000041', 'Complete', 'Medium', null, null, null, null);

-- 11) the Complete status is email-eligible
insert into _t select 11, is(
  (select email from public.notification where task_id=(select task_id from _ctx) and type='task_status'
     and user_id='75000000-0000-0000-0000-000000000041' and body like '%Complete%'),
  true, 'Complete status notification is email-eligible (email=true)');

-- ===== cross-tenant: agency B member sees no task_subscriber rows (RLS) =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000041","role":"authenticated"}';
insert into _t select 12, is_empty(
  $$ select 1 from public.task_subscriber $$,
  'cross-tenant agency cannot read another agency''s task subscribers');

-- ---------- emit ----------
set local role postgres;
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

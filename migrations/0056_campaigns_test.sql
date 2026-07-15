-- pgTap test for 0056 — campaign CRUD + auth + cross-tenant + delete guard + date validation
-- + campaign_id grouping on task/content + the client-match integrity rule + the regression
-- guards for the FOURTH create_task/update_task rebuild (0041 seeding, 0043 estimate, 0045 value).
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0056.
--
-- The write RPCs are SECURITY DEFINER (read auth.uid() from the request.jwt.claims GUC); we
-- stay as the owner and drive the caller via the GUC, dropping to `set local role authenticated`
-- only for the RLS read-visibility check (then back to postgres to read true state).
-- Harness rule: ANY temp table referenced while `set local role authenticated` is active needs
-- an explicit grant (here _ctx/_tsk are read inside the is_empty at test 14) — second time this
-- trap family has bitten (0039 was the _t insert grant).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000056', 'cm_admin@test.local'),
  ('72000000-0000-0000-0000-000000000056', 'cm_member@test.local'),
  ('73000000-0000-0000-0000-000000000056', 'cm_owner@test.local'),
  ('8b000000-0000-0000-0000-000000000056', 'cm_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000056', 'CM Agency A'),
  ('b0000000-0000-0000-0000-000000000056', 'CM Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000056', 'a0000000-0000-0000-0000-000000000056', 'CM Client A1'),
  ('c2000000-0000-0000-0000-000000000056', 'a0000000-0000-0000-0000-000000000056', 'CM Client A2');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000056', 'agency', 'a0000000-0000-0000-0000-000000000056', 'agency_admin'),
  ('72000000-0000-0000-0000-000000000056', 'agency', 'a0000000-0000-0000-0000-000000000056', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000056', 'agency', 'b0000000-0000-0000-0000-000000000056', 'agency_member');

insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d2000000-0000-0000-0000-000000000056', 'a0000000-0000-0000-0000-000000000056', 'CM Owner', '73000000-0000-0000-0000-000000000056', true);

-- Posts: one under each client (set_post_meta persist + cross-client mismatch).
insert into public.content_item (id, client_id, title) values
  ('e1000000-0000-0000-0000-000000000056', 'c1000000-0000-0000-0000-000000000056', 'Post A1'),
  ('e2000000-0000-0000-0000-000000000056', 'c2000000-0000-0000-0000-000000000056', 'Post A2');

create temp table _ctx  (campaign_id uuid);
create temp table _tsk  (task_id uuid);
create temp table _t    (seq int, line text);
grant insert on _t to authenticated;
grant select on _ctx, _tsk to authenticated;
select plan(18);

-- ============================== agency member (A) ==============================
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000056","role":"authenticated"}';

-- create a campaign under client A1
insert into _ctx
  select public.create_campaign(
    p_client_id  => 'c1000000-0000-0000-0000-000000000056',
    p_name       => 'Summer Launch',
    p_objective  => 'leads',
    p_phase      => 'planning',
    p_start_date => '2026-08-01',
    p_end_date   => '2026-08-31');

-- 1-2) create persists
insert into _t select 1, is(
  (select name from public.campaign where id=(select campaign_id from _ctx)), 'Summer Launch', 'campaign name persists on create');
insert into _t select 2, is(
  (select objective from public.campaign where id=(select campaign_id from _ctx)), 'leads', 'campaign objective persists on create');

-- 3) date-order validation on create
insert into _t select 3, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000056', p_name => 'Backwards', p_start_date => '2026-09-10', p_end_date => '2026-09-01') $$,
  'P0001');

-- 4) update changes phase
select public.update_campaign(
  p_id => (select campaign_id from _ctx), p_name => 'Summer Launch', p_objective => 'leads', p_phase => 'production');
insert into _t select 4, is(
  (select phase from public.campaign where id=(select campaign_id from _ctx)), 'production', 'campaign phase persists on update');

-- 18) an update that omits the phase preserves the current one (does not reset to 'planning')
select public.update_campaign(
  p_id => (select campaign_id from _ctx), p_name => 'Summer Launch', p_objective => 'leads');
insert into _t select 18, is(
  (select phase from public.campaign where id=(select campaign_id from _ctx)), 'production', 'update_campaign preserves phase when p_phase omitted');

-- create a task in the same client + campaign, carrying owner/estimate/value for the regression guards
insert into _tsk
  select public.create_task(
    p_client_id       => 'c1000000-0000-0000-0000-000000000056',
    p_title           => 'Campaign task',
    p_owner_id        => 'd2000000-0000-0000-0000-000000000056',
    p_estimated_hours => 4,
    p_value           => 500,
    p_campaign_id     => (select campaign_id from _ctx));

-- 5) campaign_id persists on task
insert into _t select 5, is(
  (select campaign_id from public.task where id=(select task_id from _tsk)), (select campaign_id from _ctx), 'campaign_id persists on task');
-- 6) 0041 subscriber seeding still runs after the fourth rebuild
insert into _t select 6, isnt_empty(
  $$ select 1 from public.task_subscriber where task_id=(select task_id from _tsk) $$,
  '0041 subscriber seeding preserved (regression guard)');
-- 7) 0043 estimated_hours still persists
insert into _t select 7, is(
  (select estimated_hours from public.task where id=(select task_id from _tsk)), 4::numeric, '0043 estimated_hours still persists (regression guard)');
-- 8) 0045 value still persists
insert into _t select 8, is(
  (select value from public.task where id=(select task_id from _tsk)), 500::numeric, '0045 value still persists (regression guard)');

-- 9) client-match rule: campaign of A1 on a task for A2 is rejected
insert into _t select 9, throws_ok(
  $$ select public.create_task(p_client_id => 'c2000000-0000-0000-0000-000000000056', p_title => 'Wrong client', p_campaign_id => (select campaign_id from _ctx)) $$,
  'P0001');
-- 10) client-match rule: a campaign task with no client is rejected
insert into _t select 10, throws_ok(
  $$ select public.create_task(p_title => 'No client', p_campaign_id => (select campaign_id from _ctx)) $$,
  'P0001');

-- 11) campaign_id persists on content_item via set_post_meta (post in the same client)
select public.set_post_meta(p_id => 'e1000000-0000-0000-0000-000000000056', p_campaign_id => (select campaign_id from _ctx));
insert into _t select 11, is(
  (select campaign_id from public.content_item where id='e1000000-0000-0000-0000-000000000056'), (select campaign_id from _ctx), 'campaign_id persists on content_item');
-- 12) client-match rule: campaign of A1 on a post for A2 is rejected
insert into _t select 12, throws_ok(
  $$ select public.set_post_meta(p_id => 'e2000000-0000-0000-0000-000000000056', p_campaign_id => (select campaign_id from _ctx)) $$,
  'P0001');

-- ============================== agency B (cross-tenant) ==============================
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000056","role":"authenticated"}';
-- 13) cross-tenant write: B cannot create a campaign against A's client
insert into _t select 13, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000056', p_name => 'Intruder') $$,
  'P0001');

-- 14) cross-tenant read: B cannot see A's campaign (RLS). Act as the authenticated role.
set local role authenticated;
insert into _t select 14, is_empty(
  $$ select 1 from public.campaign where id=(select campaign_id from _ctx) $$,
  'campaign invisible to another agency (RLS read)');
set local role postgres;

-- ============================== delete guard ==============================
-- 15) admin cannot delete while phase <> 'closed' (campaign is 'production')
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000056","role":"authenticated"}';
insert into _t select 15, throws_ok(
  $$ select public.delete_campaign((select campaign_id from _ctx)) $$,
  'P0001');

-- close it (as the member) so the remaining guards test admin-only, not the phase gate
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000056","role":"authenticated"}';
select public.update_campaign(p_id => (select campaign_id from _ctx), p_name => 'Summer Launch', p_phase => 'closed');

-- 16) non-admin cannot delete even when closed
insert into _t select 16, throws_ok(
  $$ select public.delete_campaign((select campaign_id from _ctx)) $$,
  'P0001');

-- 17) admin can delete a closed campaign; the row is gone (grouped rows survive via set null)
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000056","role":"authenticated"}';
select public.delete_campaign((select campaign_id from _ctx));
insert into _t select 17, is_empty(
  $$ select 1 from public.campaign where id=(select campaign_id from _ctx) $$,
  'closed campaign deleted by admin');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

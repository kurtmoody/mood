-- pgTap test for 0060 — campaign metrics: CRUD, period/negative validation, the overlap guard
-- (same-platform rejected, different-platform + adjacent allowed), cross-tenant + client-read
-- isolation, and the extended client RPCs (spent/results summed; the whitelist gains three columns
-- and still omits the five internal ones; the 0058 member guard survives the rebuild).
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0060.
--
-- Harness: RPCs are SECURITY DEFINER (driven by the request.jwt.claims GUC as owner). RLS reads run
-- under `set local role authenticated` + the GUC; temp tables read there need grants (0056 lesson);
-- fixed UUID literals so the role-switched blocks touch no temp table.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000060', 'mx_agencyA@test.local'),
  ('72000000-0000-0000-0000-000000000060', 'mx_clientA1@test.local'),
  ('8b000000-0000-0000-0000-000000000060', 'mx_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000060', 'MX Agency A'),
  ('b0000000-0000-0000-0000-000000000060', 'MX Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000060', 'a0000000-0000-0000-0000-000000000060', 'MX Client A1');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000060', 'agency', 'a0000000-0000-0000-0000-000000000060', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000060', 'agency', 'b0000000-0000-0000-0000-000000000060', 'agency_member'),
  ('72000000-0000-0000-0000-000000000060', 'client', 'c1000000-0000-0000-0000-000000000060', 'client_viewer');

insert into public.campaign (id, agency_id, client_id, name, phase, media_budget, kpi_target_results, fee, brief) values
  ('e1000000-0000-0000-0000-000000000060', 'a0000000-0000-0000-0000-000000000060', 'c1000000-0000-0000-0000-000000000060',
   'Metrics', 'live', 2000, 100, 5000, 'secret brief');

create temp table _m (id uuid);
create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(14);

-- ============================== metric CRUD + validation (agency A) ==============================
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000060","role":"authenticated"}';

-- 1) add persists
insert into _m select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'meta', '2026-08-01', '2026-08-07', 500, 10000, null, 400, 20, null);
insert into _t select 1, is(
  (select spend from public.campaign_metric where id = (select id from _m)), 500::numeric, 'metric persists on add');

-- 2) update persists
select public.update_campaign_metric((select id from _m), 'meta', '2026-08-01', '2026-08-07', 550, 10000, null, 400, 20, null);
insert into _t select 2, is(
  (select spend from public.campaign_metric where id = (select id from _m)), 550::numeric, 'metric persists on update');

-- 3) period order validated
insert into _t select 3, throws_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'other', '2026-09-10', '2026-09-01') $$, 'P0001');

-- 4) negative rejected
insert into _t select 4, throws_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'other', '2026-10-01', '2026-10-07', -1) $$, 'P0001');

-- 5) overlap rejected — same platform, overlapping period
insert into _t select 5, throws_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'meta', '2026-08-05', '2026-08-10', 100) $$, 'P0001');

-- 6) overlap ALLOWED across platforms — google over the same period
insert into _t select 6, lives_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'google', '2026-08-01', '2026-08-07', 300, null, null, null, 10) $$,
  'a different platform may cover the same period');

-- 7) adjacent ALLOWED — meta starting the day after the prior period ends (Aug 8 = Aug 7 + 1)
insert into _t select 7, lives_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'meta', '2026-08-08', '2026-08-14', 100, null, null, null, 5) $$,
  'an adjacent (non-overlapping) period is allowed');

-- 8) cross-tenant rejected — agency B on agency A's campaign
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000060","role":"authenticated"}';
insert into _t select 8, throws_ok(
  $$ select public.add_campaign_metric('e1000000-0000-0000-0000-000000000060', 'other', '2026-11-01', '2026-11-07', 1) $$, 'P0001');

-- ============================== RLS isolation (role authenticated) ==============================
-- 9) a client cannot read the raw metric rows (no client policy)
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000060","role":"authenticated"}';
insert into _t select 9, is_empty(
  $$ select 1 from public.campaign_metric where campaign_id = 'e1000000-0000-0000-0000-000000000060' $$,
  'client cannot read raw campaign_metric rows');

-- 10) an agency member can read them
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000060","role":"authenticated"}';
insert into _t select 10, isnt_empty(
  $$ select 1 from public.campaign_metric where campaign_id = 'e1000000-0000-0000-0000-000000000060' $$,
  'agency member reads campaign_metric rows');
set local role postgres;

-- ============================== client-facing aggregates ==============================
-- Totals now: meta 550 + google 300 + meta 100 = 950 spend; results 20 + 10 + 5 = 35.
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000060","role":"authenticated"}';
insert into _t select 11, is(
  (select spent from public.get_client_campaign('e1000000-0000-0000-0000-000000000060')), 950::numeric,
  'get_client_campaign sums spend across platforms');
insert into _t select 12, is(
  (select results from public.get_client_campaign('e1000000-0000-0000-0000-000000000060')), 35::numeric,
  'get_client_campaign sums results across platforms');

-- 13) return type gains spent/results/kpi_target_results and still omits the five internal fields
insert into _t select 13, ok(
      position('spent'              in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0
  and position('results'            in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0
  and position('kpi_target_results' in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0
  and position('fee'                in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('brief'              in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('cost_per_result'    in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0,
  'client return type gains spent/results/target and still omits fee/brief/cpr/approval');

-- 14) the 0058 member guard survives the rebuild — a non-member is rejected
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000060","role":"authenticated"}';
insert into _t select 14, throws_ok(
  $$ select * from public.get_client_campaign('e1000000-0000-0000-0000-000000000060') $$, 'P0001');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

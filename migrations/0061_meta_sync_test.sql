-- pgTap test for 0061 — Meta sync: link setter (validate/persist/cross-tenant), the service-role
-- upsert (insert→update the same day, no duplicate; manual-overlap skipped with a marker; non
-- service-role rejected), and the client whitelist unchanged (no meta_* leak).
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0061.
--
-- Harness: SECURITY DEFINER RPCs driven by the request.jwt.claims GUC as owner. The service-role
-- caller is simulated by a claims role of 'service_role' (auth.role() reads it). Fixed UUIDs.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000061', 'ms_agencyA@test.local'),
  ('8b000000-0000-0000-0000-000000000061', 'ms_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000061', 'MS Agency A'),
  ('b0000000-0000-0000-0000-000000000061', 'MS Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000061', 'a0000000-0000-0000-0000-000000000061', 'MS Client A1');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000061', 'agency', 'a0000000-0000-0000-0000-000000000061', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000061', 'agency', 'b0000000-0000-0000-0000-000000000061', 'agency_member');

insert into public.campaign (id, agency_id, client_id, name, phase) values
  ('e1000000-0000-0000-0000-000000000061', 'a0000000-0000-0000-0000-000000000061', 'c1000000-0000-0000-0000-000000000061', 'Meta sync', 'live');

create temp table _t (seq int, line text);
select plan(11);

-- ============================== link setter (agency A) ==============================
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000061","role":"authenticated"}';

-- 1) persists trimmed + deduped IDs
select public.set_campaign_meta_links('e1000000-0000-0000-0000-000000000061', array['  123 ', '123', '456'], 'lead');
insert into _t select 1, is(
  (select array_length(meta_campaign_ids, 1) from public.campaign where id = 'e1000000-0000-0000-0000-000000000061'),
  2, 'link setter trims + dedupes the Meta IDs');
insert into _t select 2, is(
  (select meta_results_action from public.campaign where id = 'e1000000-0000-0000-0000-000000000061'),
  'lead', 'link setter persists the results-action override');

-- 3) non-numeric ID rejected
insert into _t select 3, throws_ok(
  $$ select public.set_campaign_meta_links('e1000000-0000-0000-0000-000000000061', array['abc']) $$, 'P0001');

-- 4) cross-tenant link setter rejected
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000061","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_campaign_meta_links('e1000000-0000-0000-0000-000000000061', array['789']) $$, 'P0001');

-- ============================== synced upsert (service role) ==============================
set local request.jwt.claims = '{"role":"service_role"}';

-- 5) first upsert inserts the day
insert into _t select 5, is(
  public.upsert_synced_metric('e1000000-0000-0000-0000-000000000061', '2026-08-10', 100, 5000, 4000, 200, 8),
  'ok', 'upsert inserts a synced day');

-- 6) re-upsert the same day UPDATES (no duplicate row)
select public.upsert_synced_metric('e1000000-0000-0000-0000-000000000061', '2026-08-10', 150, 6000, 4500, 250, 9);
insert into _t select 6, is(
  (select count(*)::int from public.campaign_metric
    where campaign_id = 'e1000000-0000-0000-0000-000000000061' and platform = 'meta' and source = 'sync' and period_start = '2026-08-10'),
  1, 're-syncing a day updates, not duplicates');
insert into _t select 7, is(
  (select spend from public.campaign_metric
    where campaign_id = 'e1000000-0000-0000-0000-000000000061' and source = 'sync' and period_start = '2026-08-10'),
  150::numeric, 'the synced day reflects the latest restated values');

-- 8) manual-overlap day is skipped with a marker (manual rows win). Insert a manual meta row as
--    the agency member, then a synced day inside it → 'manual_overlap', no sync row written.
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000061","role":"authenticated"}';
select public.add_campaign_metric('e1000000-0000-0000-0000-000000000061', 'meta', '2026-09-01', '2026-09-07', 500, null, null, null, 30);
set local request.jwt.claims = '{"role":"service_role"}';
insert into _t select 8, is(
  public.upsert_synced_metric('e1000000-0000-0000-0000-000000000061', '2026-09-03', 40, 1000, 900, 50, 3),
  'manual_overlap', 'a day inside a manual period returns the manual_overlap marker');
insert into _t select 9, is(
  (select count(*)::int from public.campaign_metric
    where campaign_id = 'e1000000-0000-0000-0000-000000000061' and source = 'sync' and period_start = '2026-09-03'),
  0, 'no synced row is written over a manual period');

-- 10) a non-service-role caller cannot upsert
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000061","role":"authenticated"}';
insert into _t select 10, throws_ok(
  $$ select public.upsert_synced_metric('e1000000-0000-0000-0000-000000000061', '2026-08-20', 10) $$, 'P0001');

-- 11) the client whitelist is unchanged — get_client_campaign still omits every meta_* column
insert into _t select 11, ok(
      position('meta_'              in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('media_budget'       in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0
  and position('kpi_target_results' in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0,
  'client return type still omits all meta_* columns (whitelist unchanged)');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

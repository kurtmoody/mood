-- Migration 0061 — Meta sync (slice 7): link a campaign to Meta campaign IDs, and let a
-- service-role Edge Function upsert daily synced metrics into campaign_metric.
--
-- All new columns live on `campaign` (agency-only; clients cannot read campaign rows at all —
-- 0058). The client RPC whitelist is UNCHANGED this slice: get_client_campaign(s) must not gain
-- meta_* columns (re-asserted in the test).
--
-- Sync model:
--  * upsert_synced_metric writes one row per day (source='sync', platform='meta',
--    period_start = period_end = day), idempotent via a sync-only partial unique index, so
--    re-pulling a trailing window (Meta restates recent days) UPDATES rather than duplicates.
--  * Manual rows WIN: if a day overlaps an existing source='manual' meta row, the upsert writes
--    nothing and raises nothing — it returns 'manual_overlap' so the function can record a
--    human-readable note in meta_sync_error. Nothing double-counts; nothing silently vanishes.
--  * Only the service role may write synced rows / sync status (auth.role() = 'service_role').

-- ---------- 1. campaign columns (agency-only) ----------
alter table public.campaign add column if not exists meta_campaign_ids   text[] not null default '{}';
alter table public.campaign add column if not exists meta_results_action text;   -- action_type override
alter table public.campaign add column if not exists meta_last_synced_at timestamptz;
alter table public.campaign add column if not exists meta_sync_error     text;

-- ---------- 2. sync-only daily uniqueness (upsert conflict target) ----------
create unique index if not exists uq_campaign_metric_sync_day
  on public.campaign_metric (campaign_id, platform, period_start)
  where source = 'sync';

-- ---------- 3. link setter (agency-for-client; trim / dedupe / numeric-validate) ----------
create or replace function public.set_campaign_meta_links(
  p_id                 uuid,
  p_meta_campaign_ids  text[],
  p_meta_results_action text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_ids text[];
begin
  if auth.uid() is null then raise exception 'set_campaign_meta_links: not authenticated'; end if;
  select client_id into v_client from public.campaign where id = p_id;
  if v_client is null then raise exception 'set_campaign_meta_links: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'set_campaign_meta_links: not authorised'; end if;

  -- Trim, drop blanks, dedupe.
  select coalesce(array_agg(distinct v), '{}')
    into v_ids
    from (select btrim(unnest(coalesce(p_meta_campaign_ids, '{}'))) as v) t
   where t.v <> '';

  -- Meta campaign IDs are numeric strings.
  if exists (select 1 from unnest(v_ids) u where u !~ '^\d+$') then
    raise exception 'set_campaign_meta_links: Meta campaign IDs must be numeric';
  end if;

  update public.campaign set
    meta_campaign_ids   = v_ids,
    meta_results_action = nullif(btrim(p_meta_results_action), '')
  where id = p_id;
end; $$;

-- ---------- 4. service-role: upsert a synced day; skip (marker) on manual overlap ----------
create or replace function public.upsert_synced_metric(
  p_campaign_id uuid,
  p_day         date,
  p_spend       numeric default null,
  p_impressions bigint  default null,
  p_reach       bigint  default null,
  p_clicks      bigint  default null,
  p_results     numeric default null
) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  -- Only the Edge Function (service role) may write synced rows.
  if auth.role() <> 'service_role' then
    raise exception 'upsert_synced_metric: service role required';
  end if;
  if p_day is null then raise exception 'upsert_synced_metric: day required'; end if;

  -- Manual rows win: never overwrite / double up a human-entered meta period.
  if exists (
    select 1 from public.campaign_metric cm
     where cm.campaign_id = p_campaign_id and cm.platform = 'meta' and cm.source = 'manual'
       and cm.period_start <= p_day and p_day <= cm.period_end
  ) then
    return 'manual_overlap';
  end if;

  insert into public.campaign_metric
    (campaign_id, platform, period_start, period_end, spend, impressions, reach, clicks, results, source)
  values
    (p_campaign_id, 'meta', p_day, p_day, p_spend, p_impressions, p_reach, p_clicks, p_results, 'sync')
  on conflict (campaign_id, platform, period_start) where source = 'sync'
  do update set
    spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach,
    clicks = excluded.clicks, results = excluded.results, period_end = excluded.period_end;

  return 'ok';
end; $$;

-- ---------- 5. service-role: stamp per-campaign sync status ----------
-- p_synced_at null → leave the timestamp (a failed run keeps the last good stamp); non-null → stamp.
-- p_error null → clear; non-null → surface (API cause or the manual-overlap note).
create or replace function public.set_campaign_sync_status(
  p_id        uuid,
  p_synced_at timestamptz default null,
  p_error     text        default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'set_campaign_sync_status: service role required';
  end if;
  update public.campaign set
    meta_last_synced_at = coalesce(p_synced_at, meta_last_synced_at),
    meta_sync_error     = p_error
  where id = p_id;
end; $$;

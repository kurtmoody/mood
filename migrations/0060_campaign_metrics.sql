-- Migration 0060 — campaign metrics (slice 6): source-agnostic performance rows + the client
-- spend/results stats coming alive. Agency-internal raw rows; clients get aggregates only.
--
-- campaign_metric holds one row per (campaign, platform, period) with spend + funnel counts. It is
-- source-agnostic: source = 'manual' now, 'sync' later (slices 7/8 Meta/Google). Raw rows are
-- INTERNAL — no client RLS policy; a client sees only the summed spent/results the whitelisted
-- get_client_campaign(s) RPCs expose (the campaign row itself stays unreadable to clients — 0058).
--
-- No cost-per-hour anywhere: campaign financials are fee + media money only (the locked model).
-- CTR / cost-per-result are DISPLAY computations in the app — never stored.

-- ---------- 1. table ----------
create table if not exists public.campaign_metric (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaign(id) on delete cascade,
  platform     text not null check (platform in ('meta','google','other')),
  period_start date not null,
  period_end   date not null,
  spend        numeric,
  impressions  bigint,
  reach        bigint,
  clicks       bigint,
  results      numeric,
  source       text not null default 'manual' check (source in ('manual','sync')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint campaign_metric_period_order check (period_start <= period_end),
  constraint campaign_metric_nonneg check (
        (spend       is null or spend       >= 0)
    and (impressions is null or impressions >= 0)
    and (reach       is null or reach       >= 0)
    and (clicks      is null or clicks      >= 0)
    and (results     is null or results     >= 0))
);

create index if not exists idx_campaign_metric_campaign on public.campaign_metric (campaign_id, platform, period_start);

-- ---------- 2. RLS: agency members of the campaign's agency only; NO client policy ----------
-- Agency-only: resolve campaign→agency via an ordinary subquery. An agency member can read the
-- campaign row (0056 agency RLS) so this returns their agency_id → true; a client cannot read the
-- campaign row at all → subquery empty → false. Same pattern as campaign_template_spawn (0059).
alter table public.campaign_metric enable row level security;

drop policy if exists campaign_metric_read on public.campaign_metric;
create policy campaign_metric_read on public.campaign_metric
  for select using (
    exists (select 1 from public.campaign c
             where c.id = campaign_metric.campaign_id
               and public.is_agency_member(c.agency_id))
  );
-- No client branch (raw rows are internal). Writes go only through the RPCs below.

-- ---------- 3. write RPCs (agency-for-client via the campaign; overlap-guarded) ----------
create or replace function public.add_campaign_metric(
  p_campaign_id  uuid,
  p_platform     text,
  p_period_start date,
  p_period_end   date,
  p_spend        numeric default null,
  p_impressions  bigint  default null,
  p_reach        bigint  default null,
  p_clicks       bigint  default null,
  p_results      numeric default null,
  p_note         text    default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_client uuid; v_id uuid; v_cs date; v_ce date;
begin
  if v_uid is null then raise exception 'add_campaign_metric: not authenticated'; end if;
  select client_id into v_client from public.campaign where id = p_campaign_id;
  if v_client is null then raise exception 'add_campaign_metric: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'add_campaign_metric: not authorised'; end if;
  if p_platform not in ('meta','google','other') then raise exception 'add_campaign_metric: invalid platform %', p_platform; end if;
  if p_period_start is null or p_period_end is null then raise exception 'add_campaign_metric: period required'; end if;
  if p_period_start > p_period_end then raise exception 'add_campaign_metric: period_start must be on or before period_end'; end if;
  if (p_spend is not null and p_spend < 0) or (p_impressions is not null and p_impressions < 0)
     or (p_reach is not null and p_reach < 0) or (p_clicks is not null and p_clicks < 0)
     or (p_results is not null and p_results < 0) then
    raise exception 'add_campaign_metric: values must be >= 0';
  end if;

  -- Overlap guard: no two rows for the same (campaign, platform) may cover overlapping periods.
  select cm.period_start, cm.period_end into v_cs, v_ce
    from public.campaign_metric cm
   where cm.campaign_id = p_campaign_id and cm.platform = p_platform
     and cm.period_start <= p_period_end and p_period_start <= cm.period_end
   order by cm.period_start limit 1;
  if v_cs is not null then
    raise exception 'add_campaign_metric: period overlaps an existing % metric (% – %)', p_platform, v_cs, v_ce;
  end if;

  insert into public.campaign_metric (campaign_id, platform, period_start, period_end, spend, impressions, reach, clicks, results, source, note, created_by)
  values (p_campaign_id, p_platform, p_period_start, p_period_end, p_spend, p_impressions, p_reach, p_clicks, p_results, 'manual', p_note, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_campaign_metric(
  p_id           uuid,
  p_platform     text,
  p_period_start date,
  p_period_end   date,
  p_spend        numeric default null,
  p_impressions  bigint  default null,
  p_reach        bigint  default null,
  p_clicks       bigint  default null,
  p_results      numeric default null,
  p_note         text    default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_campaign uuid; v_cs date; v_ce date;
begin
  if auth.uid() is null then raise exception 'update_campaign_metric: not authenticated'; end if;
  select c.client_id, cm.campaign_id into v_client, v_campaign
    from public.campaign_metric cm join public.campaign c on c.id = cm.campaign_id
   where cm.id = p_id;
  if v_campaign is null then raise exception 'update_campaign_metric: metric not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_campaign_metric: not authorised'; end if;
  if p_platform not in ('meta','google','other') then raise exception 'update_campaign_metric: invalid platform %', p_platform; end if;
  if p_period_start is null or p_period_end is null then raise exception 'update_campaign_metric: period required'; end if;
  if p_period_start > p_period_end then raise exception 'update_campaign_metric: period_start must be on or before period_end'; end if;
  if (p_spend is not null and p_spend < 0) or (p_impressions is not null and p_impressions < 0)
     or (p_reach is not null and p_reach < 0) or (p_clicks is not null and p_clicks < 0)
     or (p_results is not null and p_results < 0) then
    raise exception 'update_campaign_metric: values must be >= 0';
  end if;

  -- Overlap guard, excluding this row itself.
  select cm.period_start, cm.period_end into v_cs, v_ce
    from public.campaign_metric cm
   where cm.campaign_id = v_campaign and cm.platform = p_platform and cm.id <> p_id
     and cm.period_start <= p_period_end and p_period_start <= cm.period_end
   order by cm.period_start limit 1;
  if v_cs is not null then
    raise exception 'update_campaign_metric: period overlaps an existing % metric (% – %)', p_platform, v_cs, v_ce;
  end if;

  update public.campaign_metric set
    platform = p_platform, period_start = p_period_start, period_end = p_period_end,
    spend = p_spend, impressions = p_impressions, reach = p_reach, clicks = p_clicks, results = p_results, note = p_note
  where id = p_id;
end; $$;

create or replace function public.delete_campaign_metric(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_campaign_metric: not authenticated'; end if;
  select c.client_id into v_client
    from public.campaign_metric cm join public.campaign c on c.id = cm.campaign_id
   where cm.id = p_id;
  if v_client is null then raise exception 'delete_campaign_metric: metric not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_campaign_metric: not authorised'; end if;
  delete from public.campaign_metric where id = p_id;
end; $$;

-- ---------- 4. extend the client-facing RPCs with spent / results / kpi_target_results ----------
-- Return type changes (arg signature `(uuid)` is unchanged, so one drop covers old and new — a
-- changed RETURNS TABLE requires a drop before create). The client whitelist becomes exactly:
-- id, name, phase, start_date, end_date, media_budget, spent, results, kpi_target_results.
-- STILL ABSENT: fee, brief, kpi_target_cost_per_result, brief_approved_at, brief_approved_by —
-- the cost-per-result target stays internal (the client sees their blended CPL, not our target).
-- Every column reference is table-qualified (the RETURNS TABLE / 42702 gotcha).
drop function if exists public.get_client_campaigns(uuid);
create function public.get_client_campaigns(p_client_id uuid)
returns table (
  id                 uuid,
  name               text,
  phase              text,
  start_date         date,
  end_date           date,
  media_budget       numeric,
  spent              numeric,
  results            numeric,
  kpi_target_results numeric
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'get_client_campaigns: not authenticated'; end if;
  if not (p_client_id in (select public.client_ids_for_user())) then
    raise exception 'get_client_campaigns: not authorised';
  end if;

  return query
    select c.id, c.name, c.phase, c.start_date, c.end_date, c.media_budget,
           coalesce((select sum(cm.spend)   from public.campaign_metric cm where cm.campaign_id = c.id), 0) as spent,
           coalesce((select sum(cm.results) from public.campaign_metric cm where cm.campaign_id = c.id), 0) as results,
           c.kpi_target_results
      from public.campaign c
     where c.client_id = p_client_id
       and c.phase in ('production','live','wrapped')
     order by c.created_at desc;
end; $$;

drop function if exists public.get_client_campaign(uuid);
create function public.get_client_campaign(p_campaign_id uuid)
returns table (
  id                 uuid,
  name               text,
  phase              text,
  start_date         date,
  end_date           date,
  media_budget       numeric,
  spent              numeric,
  results            numeric,
  kpi_target_results numeric
)
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'get_client_campaign: not authenticated'; end if;
  select ca.client_id into v_client from public.campaign ca where ca.id = p_campaign_id;
  if v_client is null then raise exception 'get_client_campaign: campaign not found'; end if;
  if not (v_client in (select public.client_ids_for_user())) then
    raise exception 'get_client_campaign: not authorised';
  end if;

  return query
    select c.id, c.name, c.phase, c.start_date, c.end_date, c.media_budget,
           coalesce((select sum(cm.spend)   from public.campaign_metric cm where cm.campaign_id = c.id), 0) as spent,
           coalesce((select sum(cm.results) from public.campaign_metric cm where cm.campaign_id = c.id), 0) as results,
           c.kpi_target_results
      from public.campaign c
     where c.id = p_campaign_id
       and c.phase in ('production','live','wrapped');
end; $$;

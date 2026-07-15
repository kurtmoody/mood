-- Migration 0058 — campaign milestones + the client-facing campaign read surface (slice 4).
--
-- The FIRST client-facing surface in the campaign system. Security is the whole point.
--
-- ============================================================================
-- CRITICAL — NO read policy is added to `campaign`, and none ever should be.
-- `campaign` carries fee, brief, and KPI targets. Under PostgREST, a row-level SELECT
-- policy makes EVERY column of a visible row readable (you cannot hide a single column
-- with RLS — the 0047 cost_per_hour lesson). So clients must NEVER gain row access to
-- `campaign`. The client sees campaign data ONLY through the SECURITY DEFINER RPCs below,
-- which project a hard-coded whitelist (id, name, phase, start_date, end_date, media_budget)
-- — fee / brief / kpi_target_* / brief_approved_* are absent from the RETURNS TABLE, so they
-- cannot leak even by column reference.
--
-- Consequence for milestone RLS: a milestone's visibility depends on its campaign's client,
-- but a client cannot read `campaign` rows. Resolving campaign→client inside an ordinary RLS
-- subquery would run under `campaign`'s own RLS and return empty for clients. So the check
-- goes through a SECURITY DEFINER helper (`can_read_campaign_milestone`) that reads `campaign`
-- as the owner — the same pattern as `can_see_internal_note` (0039).
-- ============================================================================

-- ---------- 1. table ----------
create table if not exists public.campaign_milestone (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign(id) on delete cascade,
  title       text not null,
  start_date  date,
  end_date    date,
  status      text not null default 'upcoming' check (status in ('upcoming','in_progress','done')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint campaign_milestone_date_order check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists idx_campaign_milestone_campaign_sort on public.campaign_milestone (campaign_id, sort_order);

-- ---------- 2. SECURITY DEFINER visibility helper (resolves campaign→client past its RLS) ----------
create or replace function public.can_read_campaign_milestone(p_campaign_id uuid)
returns boolean
language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.campaign ca
     where ca.id = p_campaign_id
       and (
         public.is_agency_for_client(ca.client_id)
         or (public.is_client_user() and ca.client_id in (select public.client_ids_for_user()))
       )
  );
$$;

-- ---------- 3. RLS: agency sees all their milestones; a client sees only their campaigns' ----------
alter table public.campaign_milestone enable row level security;

drop policy if exists campaign_milestone_read on public.campaign_milestone;
create policy campaign_milestone_read on public.campaign_milestone
  for select using (public.can_read_campaign_milestone(campaign_id));
-- No client branch on `campaign` itself (see header). Writes go only through the RPCs below.

-- ---------- 4. milestone write RPCs (agency-for-client; validate the campaign's client) ----------
create or replace function public.create_campaign_milestone(
  p_campaign_id uuid,
  p_title       text,
  p_start_date  date default null,
  p_end_date    date default null,
  p_status      text default 'upcoming'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_client uuid; v_id uuid; v_sort int; v_status text;
begin
  if v_uid is null then raise exception 'create_campaign_milestone: not authenticated'; end if;
  select client_id into v_client from public.campaign where id = p_campaign_id;
  if v_client is null then raise exception 'create_campaign_milestone: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'create_campaign_milestone: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'create_campaign_milestone: title required'; end if;
  v_status := coalesce(nullif(btrim(p_status), ''), 'upcoming');
  if v_status not in ('upcoming','in_progress','done') then
    raise exception 'create_campaign_milestone: invalid status %', v_status;
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'create_campaign_milestone: start_date must be on or before end_date';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_sort
    from public.campaign_milestone where campaign_id = p_campaign_id;

  insert into public.campaign_milestone (campaign_id, title, start_date, end_date, status, sort_order)
  values (p_campaign_id, btrim(p_title), p_start_date, p_end_date, v_status, v_sort)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_campaign_milestone(
  p_id         uuid,
  p_title      text,
  p_start_date date default null,
  p_end_date   date default null,
  p_status     text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'update_campaign_milestone: not authenticated'; end if;
  select ca.client_id into v_client
    from public.campaign_milestone m join public.campaign ca on ca.id = m.campaign_id
   where m.id = p_id;
  if v_client is null then raise exception 'update_campaign_milestone: milestone not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_campaign_milestone: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'update_campaign_milestone: title required'; end if;
  v_status := coalesce(nullif(btrim(p_status), ''), 'upcoming');
  if v_status not in ('upcoming','in_progress','done') then
    raise exception 'update_campaign_milestone: invalid status %', v_status;
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'update_campaign_milestone: start_date must be on or before end_date';
  end if;

  update public.campaign_milestone set
    title = btrim(p_title), start_date = p_start_date, end_date = p_end_date, status = v_status
  where id = p_id;
end; $$;

create or replace function public.delete_campaign_milestone(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_campaign_milestone: not authenticated'; end if;
  select ca.client_id into v_client
    from public.campaign_milestone m join public.campaign ca on ca.id = m.campaign_id
   where m.id = p_id;
  if v_client is null then raise exception 'delete_campaign_milestone: milestone not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_campaign_milestone: not authorised'; end if;
  delete from public.campaign_milestone where id = p_id;
end; $$;

-- Reorder — sort_order := each id's 0-based position, scoped to the campaign (agency-for-client).
create or replace function public.reorder_campaign_milestone(p_campaign_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'reorder_campaign_milestone: not authenticated'; end if;
  select client_id into v_client from public.campaign where id = p_campaign_id;
  if v_client is null then raise exception 'reorder_campaign_milestone: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'reorder_campaign_milestone: not authorised'; end if;

  update public.campaign_milestone m
     set sort_order = ord.idx
    from (select id, (ordinality - 1)::int as idx
            from unnest(p_ordered_ids) with ordinality as t(id, ordinality)) ord
   where m.id = ord.id and m.campaign_id = p_campaign_id;
end; $$;

-- ---------- 5. client-facing read RPCs — whitelisted projection, member-only, prod/live/wrapped ----------
-- The ONLY path by which a client reads campaign data. RETURNS TABLE lists the six safe columns
-- and nothing else — fee / brief / kpi_target_* / brief_approved_* cannot appear. Caller must be a
-- member (client OR agency) of the client. Only production/live/wrapped are ever surfaced here, so
-- planning (unshaped) and closed campaigns are invisible to the client path at the data layer.
create or replace function public.get_client_campaigns(p_client_id uuid)
returns table (
  id           uuid,
  name         text,
  phase        text,
  start_date   date,
  end_date     date,
  media_budget numeric
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'get_client_campaigns: not authenticated'; end if;
  if not (p_client_id in (select public.client_ids_for_user())) then
    raise exception 'get_client_campaigns: not authorised';
  end if;

  return query
    select c.id, c.name, c.phase, c.start_date, c.end_date, c.media_budget
      from public.campaign c
     where c.client_id = p_client_id
       and c.phase in ('production','live','wrapped')
     order by c.created_at desc;
end; $$;

create or replace function public.get_client_campaign(p_campaign_id uuid)
returns table (
  id           uuid,
  name         text,
  phase        text,
  start_date   date,
  end_date     date,
  media_budget numeric
)
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'get_client_campaign: not authenticated'; end if;
  -- Alias + qualify: `id` (and the other output column names) are RETURNS TABLE variables, so an
  -- unqualified `where id = ...` is ambiguous (42702). Every column reference in this body is
  -- table-qualified so the parser never has to choose between an OUT variable and a column.
  select ca.client_id into v_client from public.campaign ca where ca.id = p_campaign_id;
  if v_client is null then raise exception 'get_client_campaign: campaign not found'; end if;
  if not (v_client in (select public.client_ids_for_user())) then
    raise exception 'get_client_campaign: not authorised';
  end if;

  -- Member confirmed; the row is still gated to the client-visible phases (else no row).
  return query
    select c.id, c.name, c.phase, c.start_date, c.end_date, c.media_budget
      from public.campaign c
     where c.id = p_campaign_id
       and c.phase in ('production','live','wrapped');
end; $$;

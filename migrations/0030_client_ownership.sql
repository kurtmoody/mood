-- Migration 0030 — per-client ownership (Slice: ownership model).
--
-- 1:1 with client (like client_internal), agency-only. Internal staffing — clients
-- NEVER see this. Eight nullable role slots, each → team_member. RPC-only writes.

create table if not exists public.client_ownership (
  client_id         uuid primary key references public.client(id) on delete cascade,
  lead_pm_id        uuid references public.team_member(id) on delete set null,
  comms_backup_id   uuid references public.team_member(id) on delete set null,
  creative_lead_id  uuid references public.team_member(id) on delete set null,
  design_owner_id   uuid references public.team_member(id) on delete set null,
  content_owner_id  uuid references public.team_member(id) on delete set null,
  video_owner_id    uuid references public.team_member(id) on delete set null,
  sales_ops_id      uuid references public.team_member(id) on delete set null,
  intern_support_id uuid references public.team_member(id) on delete set null,
  updated_at        timestamptz default now()
);

-- ---------- RLS: agency-only read, no client branch, no write policies ----------
alter table public.client_ownership enable row level security;

drop policy if exists client_ownership_read on public.client_ownership;
create policy client_ownership_read on public.client_ownership
  for select using (public.is_agency_for_client(client_id));
-- Internal staffing: no client branch. Writes go only through set_client_ownership.

-- ---------- RPC: upsert (agency-for-client) ----------
create or replace function public.set_client_ownership(
  p_client_id         uuid,
  p_lead_pm_id        uuid default null,
  p_comms_backup_id   uuid default null,
  p_creative_lead_id  uuid default null,
  p_design_owner_id   uuid default null,
  p_content_owner_id  uuid default null,
  p_video_owner_id    uuid default null,
  p_sales_ops_id      uuid default null,
  p_intern_support_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'set_client_ownership: not authenticated'; end if;
  select agency_id into v_agency from public.client where id = p_client_id;
  if v_agency is null then raise exception 'set_client_ownership: client not found'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'set_client_ownership: not authorised'; end if;

  -- Any assigned person must be a team_member of this client's agency.
  if exists (
    select 1 from (values
      (p_lead_pm_id), (p_comms_backup_id), (p_creative_lead_id), (p_design_owner_id),
      (p_content_owner_id), (p_video_owner_id), (p_sales_ops_id), (p_intern_support_id)
    ) as v(tm)
    where v.tm is not null
      and not exists (select 1 from public.team_member t where t.id = v.tm and t.agency_id = v_agency)
  ) then raise exception 'set_client_ownership: owner not in your agency'; end if;

  insert into public.client_ownership (
    client_id, lead_pm_id, comms_backup_id, creative_lead_id, design_owner_id,
    content_owner_id, video_owner_id, sales_ops_id, intern_support_id, updated_at)
  values (
    p_client_id, p_lead_pm_id, p_comms_backup_id, p_creative_lead_id, p_design_owner_id,
    p_content_owner_id, p_video_owner_id, p_sales_ops_id, p_intern_support_id, now())
  on conflict (client_id) do update set
    lead_pm_id        = excluded.lead_pm_id,
    comms_backup_id   = excluded.comms_backup_id,
    creative_lead_id  = excluded.creative_lead_id,
    design_owner_id   = excluded.design_owner_id,
    content_owner_id  = excluded.content_owner_id,
    video_owner_id    = excluded.video_owner_id,
    sales_ops_id      = excluded.sales_ops_id,
    intern_support_id = excluded.intern_support_id,
    updated_at        = now();
end; $$;

-- Migration 0047 — move cost_per_hour off the member-readable agency table into an
-- admin-only agency_internal table (hardening the leak flagged in piece 3).
--
-- agency.cost_per_hour (0046) was readable by ANY agency member via the agency_read RLS
-- policy. RLS can't hide a single column, so we relocate the sensitive rate to a new
-- agency_internal table (the client_internal pattern), whose RLS only lets agency_admin
-- of that agency SELECT it. Writes stay through the admin-only set_agency_cost_per_hour
-- RPC (repointed here). Existing values are migrated, then the agency column is dropped.

create table if not exists public.agency_internal (
  agency_id     uuid primary key references public.agency(id) on delete cascade,
  cost_per_hour numeric,
  created_at    timestamptz not null default now()
);

alter table public.agency_internal enable row level security;

-- Read: agency_admin of that agency only (stricter than client_internal — this is cost data).
drop policy if exists agency_internal_read on public.agency_internal;
create policy agency_internal_read on public.agency_internal
  for select using (
    exists (
      select 1 from public.membership m
       where m.user_id = auth.uid() and m.scope_type = 'agency'
         and m.scope_id = public.agency_internal.agency_id and m.role = 'agency_admin'
    )
  );
-- No write policy: writes go through the SECURITY DEFINER RPC below.

-- Migrate any existing rates off the agency table.
insert into public.agency_internal (agency_id, cost_per_hour)
select id, cost_per_hour from public.agency where cost_per_hour is not null
on conflict (agency_id) do update set cost_per_hour = excluded.cost_per_hour;

-- Close the leak: drop the member-readable column.
alter table public.agency drop column if exists cost_per_hour;

-- Repoint the setter at agency_internal (admin-only; upsert).
create or replace function public.set_agency_cost_per_hour(p_agency_id uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'set_agency_cost_per_hour: not authenticated'; end if;
  if p_rate is not null and p_rate < 0 then
    raise exception 'set_agency_cost_per_hour: rate must be >= 0';
  end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin'
  ) then raise exception 'set_agency_cost_per_hour: not authorised'; end if;

  insert into public.agency_internal (agency_id, cost_per_hour)
  values (p_agency_id, p_rate)
  on conflict (agency_id) do update set cost_per_hour = excluded.cost_per_hour;
end; $$;

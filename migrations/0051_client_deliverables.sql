-- Migration 0051 — agreed deliverables per client (retainer scope).
--
-- What the agency has committed to deliver for a client — e.g. label "Instagram posts",
-- quantity 12, cadence "per_month". Agency-internal CRM data like client_internal /
-- brand_asset / client_ownership: RLS gates reads (agency-for-client, NO client/portal
-- path), and ALL writes go through SECURITY DEFINER RPCs (no permissive write policy).
--
-- Deliberate v1 omission: no client_visible flag — agency-only, no portal read path, like
-- the other CRM tables. A client-facing view, if ever built, is a one-column add then.

-- ---------- 1. table ----------
create table if not exists public.client_deliverable (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.client(id) on delete cascade,
  label      text not null,
  quantity   numeric,
  cadence    text check (cadence in ('per_week','per_month','per_quarter','per_year','one_off','ongoing')),
  notes      text,
  sort_order int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_client_deliverable_client_sort
  on public.client_deliverable (client_id, sort_order);

-- ---------- 2. RLS: agency-for-client read only, no client branch, no write policy ----------
alter table public.client_deliverable enable row level security;

drop policy if exists client_deliverable_read on public.client_deliverable;
create policy client_deliverable_read on public.client_deliverable
  for select using (public.is_agency_for_client(client_id));
-- Internal CRM: no client branch. Writes go only through the RPCs below.

-- ---------- 3. RPCs (agency-for-client, RPC-only writes) ----------
create or replace function public.add_client_deliverable(
  p_client_id uuid,
  p_label text,
  p_quantity numeric default null,
  p_cadence text default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_sort int;
begin
  if v_uid is null then raise exception 'add_client_deliverable: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'add_client_deliverable: not authorised'; end if;
  if p_label is null or btrim(p_label) = '' then raise exception 'add_client_deliverable: label required'; end if;
  if p_cadence is not null and p_cadence not in ('per_week','per_month','per_quarter','per_year','one_off','ongoing') then
    raise exception 'add_client_deliverable: invalid cadence';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_sort
    from public.client_deliverable where client_id = p_client_id;

  insert into public.client_deliverable (client_id, label, quantity, cadence, notes, sort_order, created_by)
  values (p_client_id, btrim(p_label), p_quantity, p_cadence, p_notes, v_sort, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_client_deliverable(
  p_id uuid,
  p_label text,
  p_quantity numeric default null,
  p_cadence text default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'update_client_deliverable: not authenticated'; end if;
  select client_id into v_client from public.client_deliverable where id = p_id;
  if v_client is null then raise exception 'update_client_deliverable: deliverable not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_client_deliverable: not authorised'; end if;
  if p_label is null or btrim(p_label) = '' then raise exception 'update_client_deliverable: label required'; end if;
  if p_cadence is not null and p_cadence not in ('per_week','per_month','per_quarter','per_year','one_off','ongoing') then
    raise exception 'update_client_deliverable: invalid cadence';
  end if;

  update public.client_deliverable set
    label = btrim(p_label), quantity = p_quantity, cadence = p_cadence,
    notes = p_notes, updated_at = now()
  where id = p_id;
end; $$;

create or replace function public.delete_client_deliverable(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_client_deliverable: not authenticated'; end if;
  select client_id into v_client from public.client_deliverable where id = p_id;
  if v_client is null then raise exception 'delete_client_deliverable: deliverable not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_client_deliverable: not authorised'; end if;
  delete from public.client_deliverable where id = p_id;
end; $$;

create or replace function public.reorder_client_deliverable(p_client_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'reorder_client_deliverable: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'reorder_client_deliverable: not authorised'; end if;

  -- sort_order := each id's 0-based position. The client_id guard means only this
  -- client's deliverables are touched; ids not belonging to it are ignored.
  update public.client_deliverable d
     set sort_order = ord.idx
    from (
      select id, (ordinality - 1)::int as idx
        from unnest(p_ordered_ids) with ordinality as t(id, ordinality)
    ) ord
   where d.id = ord.id
     and d.client_id = p_client_id;
end; $$;

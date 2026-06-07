-- Migration 0008 — brand asset CRUD RPCs (brand_asset table already exists from 0001)

create or replace function public.add_brand_asset(
  p_client_id uuid, p_kind text, p_label text default null,
  p_value text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'add_brand_asset: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'add_brand_asset: not authorised'; end if;
  if p_kind not in ('logo','colour','font','guideline','other') then
    raise exception 'add_brand_asset: invalid kind';
  end if;
  insert into public.brand_asset (client_id, kind, label, value, notes)
  values (p_client_id, p_kind, p_label, p_value, p_notes)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.delete_brand_asset(p_asset_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_brand_asset: not authenticated'; end if;
  select client_id into v_client from public.brand_asset where id = p_asset_id;
  if v_client is null then return; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_brand_asset: not authorised'; end if;
  delete from public.brand_asset where id = p_asset_id;
end; $$;

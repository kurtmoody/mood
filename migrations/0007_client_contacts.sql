-- Migration 0007 — client contacts: split name, + CRUD RPCs

-- 1. Adjust client_contact: split name into first_name / surname (no data yet).
alter table public.client_contact drop column if exists name;
alter table public.client_contact add column if not exists first_name text;
alter table public.client_contact add column if not exists surname text;

-- 2. add_contact RPC
create or replace function public.add_contact(
  p_client_id uuid, p_first_name text, p_surname text default null, p_role text default null,
  p_email text default null, p_phone text default null, p_is_primary boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'add_contact: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'add_contact: not authorised'; end if;
  if p_is_primary then
    update public.client_contact set is_primary = false where client_id = p_client_id and is_primary;
  end if;
  insert into public.client_contact (client_id, first_name, surname, role, email, phone, is_primary)
  values (p_client_id, p_first_name, p_surname, p_role, p_email, p_phone, coalesce(p_is_primary,false))
  returning id into v_id;
  return v_id;
end; $$;

-- 3. update_contact RPC
create or replace function public.update_contact(
  p_contact_id uuid, p_first_name text, p_surname text default null, p_role text default null,
  p_email text default null, p_phone text default null, p_is_primary boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'update_contact: not authenticated'; end if;
  select client_id into v_client from public.client_contact where id = p_contact_id;
  if v_client is null then raise exception 'update_contact: contact not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_contact: not authorised'; end if;
  if p_is_primary then
    update public.client_contact set is_primary = false where client_id = v_client and is_primary and id <> p_contact_id;
  end if;
  update public.client_contact set
    first_name = p_first_name, surname = p_surname, role = p_role,
    email = p_email, phone = p_phone, is_primary = coalesce(p_is_primary,false)
  where id = p_contact_id;
end; $$;

-- 4. delete_contact RPC
create or replace function public.delete_contact(p_contact_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_contact: not authenticated'; end if;
  select client_id into v_client from public.client_contact where id = p_contact_id;
  if v_client is null then return; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_contact: not authorised'; end if;
  delete from public.client_contact where id = p_contact_id;
end; $$;

-- Migration 0009 — channel CRUD RPCs

create or replace function public.add_channel(
  p_client_id uuid, p_type text, p_label text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'add_channel: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'add_channel: not authorised'; end if;
  insert into public.channel (client_id, type, label) values (p_client_id, p_type, p_label) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.delete_channel(p_channel_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_channel: not authenticated'; end if;
  select client_id into v_client from public.channel where id = p_channel_id;
  if v_client is null then return; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_channel: not authorised'; end if;
  delete from public.channel where id = p_channel_id;
end; $$;

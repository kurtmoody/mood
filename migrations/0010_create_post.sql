-- Migration 0010 — create_post RPC (content_item + initial content_version)

create or replace function public.create_post(
  p_client_id    uuid,
  p_channel_id   uuid default null,
  p_title        text default null,
  p_content_type text default 'post',
  p_scheduled_at timestamptz default null,
  p_body         text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_item uuid;
  v_ver  uuid;
begin
  if auth.uid() is null then raise exception 'create_post: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'create_post: not authorised'; end if;

  insert into public.content_item (client_id, channel_id, title, content_type, scheduled_at, status, created_by)
  values (p_client_id, p_channel_id, p_title, coalesce(nullif(p_content_type,''),'post'), p_scheduled_at, 'draft', auth.uid())
  returning id into v_item;

  insert into public.content_version (content_item_id, version_no, body, created_by)
  values (v_item, 1, p_body, auth.uid())
  returning id into v_ver;

  update public.content_item set current_version_id = v_ver, updated_at = now() where id = v_item;

  return v_item;
end; $$;

-- Migration 0014 — edit a post (agency; editable only before it reaches the client)

create or replace function public.update_post(
  p_item_id      uuid,
  p_title        text,
  p_channel_id   uuid,
  p_scheduled_at timestamptz,
  p_body         text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client  uuid;
  v_status  public.content_status;
  v_version uuid;
begin
  if auth.uid() is null then raise exception 'update_post: not authenticated'; end if;

  select client_id, status, current_version_id
    into v_client, v_status, v_version
    from public.content_item where id = p_item_id;

  if v_client is null then raise exception 'update_post: post not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_post: not authorised'; end if;

  if v_status not in ('draft','internal_review','changes_requested') then
    raise exception 'update_post: cannot edit a post once it has reached the client (status %)', v_status;
  end if;

  if p_channel_id is not null and not exists (
       select 1 from public.channel c where c.id = p_channel_id and c.client_id = v_client
     ) then
    raise exception 'update_post: channel does not belong to this client';
  end if;

  update public.content_item
     set title        = coalesce(p_title, title),
         channel_id   = coalesce(p_channel_id, channel_id),
         scheduled_at = coalesce(p_scheduled_at, scheduled_at),
         updated_at   = now()
   where id = p_item_id;

  update public.content_version
     set body = p_body
   where id = v_version;
end; $$;

-- Migration 0012 — comments: add_comment + delete_comment RPCs

create or replace function public.add_comment(
  p_item_id uuid,
  p_body    text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'add_comment: not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'add_comment: empty comment'; end if;

  select client_id into v_client from public.content_item where id = p_item_id;
  if v_client is null then raise exception 'add_comment: post not found'; end if;

  if v_client not in (select public.client_ids_for_user()) then
    raise exception 'add_comment: not authorised';
  end if;

  insert into public.comment (content_item_id, author_id, body)
  values (p_item_id, auth.uid(), p_body)
  returning id into v_id;

  return v_id;
end; $$;

create or replace function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_author uuid;
  v_item   uuid;
  v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_comment: not authenticated'; end if;

  select author_id, content_item_id into v_author, v_item
    from public.comment where id = p_comment_id;
  if v_item is null then return; end if;

  select client_id into v_client from public.content_item where id = v_item;

  if v_author = auth.uid() or public.is_agency_for_client(v_client) then
    delete from public.comment where id = p_comment_id;
  else
    raise exception 'delete_comment: not authorised';
  end if;
end; $$;

-- Migration 0052 — split post content into Visual Content + Caption.
--
-- Adds content_version.visual_content (text), a SECOND versioned, client-visible
-- content field alongside the existing `body` (which now means the Caption — the UI
-- relabels it; existing rows already hold the caption text, so no data move needed).
--
-- Both fields:
--   * are versioned (forked together on a frozen-post edit, exactly like `body`),
--   * inherit the content read floor (clients see them from client_review onward),
--   * are returned by get_post_versions for agency AND client (visual_content is NOT
--     nulled for clients — unlike internal_note — because it is client-visible).
--
-- Backward-compatible: the new param defaults to null and the new column is nullable,
-- so existing app calls (which don't pass visual_content yet) keep working until the
-- UI is wired in a later step. Duplicate-function trap respected: each signature that
-- changes is dropped by its EXACT old arg list, then the full current body recreated.

-- ---------- 1. column ----------
alter table public.content_version
  add column if not exists visual_content text;

-- ---------- 2. create_post (was 0010) — append p_visual_content ----------
drop function if exists public.create_post(uuid, uuid, text, text, timestamptz, text);

create function public.create_post(
  p_client_id      uuid,
  p_channel_id     uuid default null,
  p_title          text default null,
  p_content_type   text default 'post',
  p_scheduled_at   timestamptz default null,
  p_body           text default null,
  p_visual_content text default null
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

  insert into public.content_version (content_item_id, version_no, body, visual_content, created_by)
  values (v_item, 1, p_body, p_visual_content, auth.uid())
  returning id into v_ver;

  update public.content_item set current_version_id = v_ver, updated_at = now() where id = v_item;

  return v_item;
end; $$;

-- ---------- 3. update_post (was 0024) — append p_visual_content; handle both branches ----------
drop function if exists public.update_post(uuid, text, uuid, timestamptz, text);

create function public.update_post(
  p_item_id        uuid,
  p_title          text,
  p_channel_id     uuid,
  p_scheduled_at   timestamptz,
  p_body           text,
  p_visual_content text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_client  uuid;
  v_status  public.content_status;
  v_version uuid;
  v_new     uuid;
  v_next    int;
  v_pairs   jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'update_post: not authenticated'; end if;

  select client_id, status, current_version_id
    into v_client, v_status, v_version
    from public.content_item where id = p_item_id;

  if v_client is null then raise exception 'update_post: post not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_post: not authorised'; end if;

  if p_channel_id is not null and not exists (
       select 1 from public.channel c where c.id = p_channel_id and c.client_id = v_client
     ) then
    raise exception 'update_post: channel does not belong to this client';
  end if;

  if v_status in ('draft','internal_review','changes_requested') then
    -- Mutable: edit the current version in place.
    update public.content_item
       set title        = coalesce(p_title, title),
           channel_id   = coalesce(p_channel_id, channel_id),
           scheduled_at = coalesce(p_scheduled_at, scheduled_at),
           updated_at   = now()
     where id = p_item_id;

    update public.content_version
       set body           = p_body,
           visual_content = p_visual_content
     where id = v_version;

  else
    -- Frozen: fork a new version (carrying internal_note + media + the new content).
    v_new := gen_random_uuid();
    select coalesce(max(version_no), 0) + 1 into v_next
      from public.content_version where content_item_id = p_item_id;

    insert into public.content_version (id, content_item_id, version_no, body, visual_content, internal_note, created_by)
    select v_new, p_item_id, v_next, p_body, p_visual_content, cv.internal_note, auth.uid()
      from public.content_version cv where cv.id = v_version;

    -- Copy media to new paths under the v2 folder, carrying sort_order forward.
    with src as (
      select m.storage_path as old_path, m.mime_type, m.size_bytes, m.sort_order,
             (v_client::text || '/' || p_item_id::text || '/' || v_new::text || '/' ||
              substring(m.storage_path from '[^/]+$')) as new_path
        from public.media m
       where m.version_id = v_version
    ),
    ins as (
      insert into public.media (version_id, storage_path, mime_type, size_bytes, created_by, sort_order)
      select v_new, new_path, mime_type, size_bytes, auth.uid(), sort_order from src
      returning 1
    )
    select coalesce(jsonb_agg(jsonb_build_object('old_path', old_path, 'new_path', new_path)), '[]'::jsonb)
      into v_pairs
      from src;

    update public.content_item
       set title        = coalesce(p_title, title),
           channel_id   = coalesce(p_channel_id, channel_id),
           scheduled_at = coalesce(p_scheduled_at, scheduled_at),
           current_version_id = v_new,
           status       = 'internal_review',
           updated_at   = now()
     where id = p_item_id;
  end if;

  return v_pairs;
end; $$;

-- ---------- 4. get_post_versions (was 0024) — add visual_content to the result ----------
-- Return columns change, so this must be DROPPED first (create-or-replace can't change
-- a function's OUT columns). visual_content is returned to clients too (client-visible).
drop function if exists public.get_post_versions(uuid);

create function public.get_post_versions(p_item_id uuid)
returns table (
  version_id     uuid,
  version_no     int,
  body           text,
  visual_content text,
  internal_note  text,
  created_by     uuid,
  created_at     timestamptz,
  is_current     boolean,
  events         jsonb,
  media          jsonb
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_client    uuid;
  v_current   uuid;
  v_is_agency boolean;
  v_is_client boolean;
begin
  if auth.uid() is null then raise exception 'get_post_versions: not authenticated'; end if;

  select ci.client_id, ci.current_version_id
    into v_client, v_current
    from public.content_item ci where ci.id = p_item_id;
  if v_client is null then raise exception 'get_post_versions: post not found'; end if;

  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'client'
       and m.scope_id = v_client
  );

  if not v_is_agency and not v_is_client then
    raise exception 'get_post_versions: not authorised';
  end if;

  return query
  select
    cv.id,
    cv.version_no,
    cv.body,
    cv.visual_content,
    case when v_is_agency then cv.internal_note else null end,
    cv.created_by,
    cv.created_at,
    (cv.id = v_current) as is_current,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'version_id', ae.version_id,
               'action',     ae.action,
               'created_at', ae.created_at,
               'actor_id',   ae.actor_id
             ) order by ae.created_at)
        from public.approval_event ae
       where ae.version_id = cv.id
    ), '[]'::jsonb) as events,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           md.id,
               'storage_path', md.storage_path,
               'mime_type',    md.mime_type
             ) order by md.sort_order, md.created_at)
        from public.media md
       where md.version_id = cv.id
    ), '[]'::jsonb) as media
  from public.content_version cv
  where cv.content_item_id = p_item_id
    and (
      v_is_agency
      or exists (
        select 1 from public.approval_event ae2
         where ae2.version_id = cv.id
           and ae2.action = 'approve_internal'
      )
    )
  order by cv.version_no desc;
end; $$;

-- ---------- 5. refresh the PostgREST schema cache ----------
notify pgrst, 'reload schema';

-- Migration 0024 — persisted media ordering.
--
-- Adds media.sort_order, a reorder_media RPC (agency-only), carries sort_order forward
-- on the fork, and orders media reads by sort_order. The drag UI is a later step.

-- ---------- 1. column + backfill + index ----------
alter table public.media add column if not exists sort_order int not null default 0;

-- One-time backfill: order each version's media by created_at (0-based). Guarded so a
-- re-run after any real reordering won't reset it.
do $$ begin
  if not exists (select 1 from public.media where sort_order <> 0) then
    with ranked as (
      select id, row_number() over (partition by version_id order by created_at) - 1 as so
        from public.media
    )
    update public.media m set sort_order = ranked.so from ranked where ranked.id = m.id;
  end if;
end $$;

create index if not exists idx_media_version_sort on public.media (version_id, sort_order);

-- ---------- 2. reorder_media (agency-only) ----------
create or replace function public.reorder_media(p_version_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
begin
  if auth.uid() is null then raise exception 'reorder_media: not authenticated'; end if;

  select ci.client_id into v_client
    from public.content_version cv
    join public.content_item ci on ci.id = cv.content_item_id
   where cv.id = p_version_id;
  if v_client is null then raise exception 'reorder_media: version not found'; end if;

  -- Agency only — clients never reorder.
  if not public.is_agency_for_client(v_client) then
    raise exception 'reorder_media: not authorised';
  end if;

  -- Set sort_order to each id's position in the array. The version_id guard means only
  -- this version's media are touched; ids that aren't its media are ignored.
  update public.media m
     set sort_order = ord.idx
    from (
      select id, (ordinality - 1)::int as idx
        from unnest(p_ordered_ids) with ordinality as t(id, ordinality)
    ) ord
   where m.id = ord.id
     and m.version_id = p_version_id;
end; $$;

-- ---------- 3. update_post: carry sort_order forward on the fork (0021 otherwise unchanged) ----------
drop function if exists public.update_post(uuid, text, uuid, timestamptz, text);

create function public.update_post(
  p_item_id      uuid,
  p_title        text,
  p_channel_id   uuid,
  p_scheduled_at timestamptz,
  p_body         text
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
    update public.content_item
       set title        = coalesce(p_title, title),
           channel_id   = coalesce(p_channel_id, channel_id),
           scheduled_at = coalesce(p_scheduled_at, scheduled_at),
           updated_at   = now()
     where id = p_item_id;

    update public.content_version set body = p_body where id = v_version;

  else
    v_new := gen_random_uuid();
    select coalesce(max(version_no), 0) + 1 into v_next
      from public.content_version where content_item_id = p_item_id;

    insert into public.content_version (id, content_item_id, version_no, body, internal_note, created_by)
    select v_new, p_item_id, v_next, p_body, cv.internal_note, auth.uid()
      from public.content_version cv where cv.id = v_version;

    -- Copy media to new paths under the v2 folder, carrying sort_order forward so v2
    -- preserves v1's ordering.
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

-- ---------- 4. get_post_versions: order media by sort_order (0022 otherwise unchanged) ----------
create or replace function public.get_post_versions(p_item_id uuid)
returns table (
  version_id    uuid,
  version_no    int,
  body          text,
  internal_note text,
  created_by    uuid,
  created_at    timestamptz,
  is_current    boolean,
  events        jsonb,
  media         jsonb
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

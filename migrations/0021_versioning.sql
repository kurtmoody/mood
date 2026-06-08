-- Migration 0021 — snapshot-on-send versioning.
--
-- Versions are mutable while a post is in draft / internal_review /
-- changes_requested. They FREEZE at client_review (and stay frozen through
-- approved / scheduled / posted). Editing a frozen post forks a new version:
-- v2 copies the current body + internal_note + media forward, content_item-level
-- fields (title/channel/scheduled) are updated, current_version_id repoints to v2,
-- and the post bounces to internal_review for re-review.
--
-- Only body + internal_note + media are versioned; title/channel/scheduled live on
-- content_item and are NOT snapshotted. Storage objects cannot be copied from
-- Postgres, so the RPC does all DB work and RETURNS the {old_path, new_path} pairs;
-- the app-layer edit action performs storage.copy(old, new) for each.

-- ---------- 1. integrity guards ----------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'uq_version_no') then
    alter table public.content_version add constraint uq_version_no unique (content_item_id, version_no);
  end if;
end $$;

-- current_version_id must point at a real version. Default NO ACTION is compatible
-- with content_version.content_item_id's ON DELETE CASCADE (deleting a content_item
-- removes the referencing row in the same statement), and blocks deleting a version
-- that is still some post's current. If this fails, a dangling pointer exists — stop.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_current_version') then
    alter table public.content_item
      add constraint fk_current_version foreign key (current_version_id) references public.content_version(id);
  end if;
end $$;

-- ---------- 2. update_post: status-aware (in-place vs fork) ----------
-- Return type changes void -> jsonb, so we DROP and re-create (same signature).
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
  v_version uuid;       -- current version id
  v_new     uuid;       -- forked (v2) version id
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
    -- MUTABLE: edit in place (behaviour unchanged from 0014).
    update public.content_item
       set title        = coalesce(p_title, title),
           channel_id   = coalesce(p_channel_id, channel_id),
           scheduled_at = coalesce(p_scheduled_at, scheduled_at),
           updated_at   = now()
     where id = p_item_id;

    update public.content_version set body = p_body where id = v_version;

  else
    -- FROZEN (client_review / approved / scheduled / posted): fork a new version.
    v_new := gen_random_uuid();
    select coalesce(max(version_no), 0) + 1 into v_next
      from public.content_version where content_item_id = p_item_id;

    insert into public.content_version (id, content_item_id, version_no, body, internal_note, created_by)
    select v_new, p_item_id, v_next, p_body, cv.internal_note, auth.uid()
      from public.content_version cv where cv.id = v_version;

    -- Copy each current-version media row to a NEW path under the v2 folder; collect
    -- {old_path, new_path} so the app can storage.copy them. New paths carry v_new,
    -- so they never collide with v1's (storage_path is unique) and v1 stays intact.
    with src as (
      select m.storage_path as old_path, m.mime_type, m.size_bytes,
             (v_client::text || '/' || p_item_id::text || '/' || v_new::text || '/' ||
              substring(m.storage_path from '[^/]+$')) as new_path
        from public.media m
       where m.version_id = v_version
    ),
    ins as (
      insert into public.media (version_id, storage_path, mime_type, size_bytes, created_by)
      select v_new, new_path, mime_type, size_bytes, auth.uid() from src
      returning 1
    )
    select coalesce(jsonb_agg(jsonb_build_object('old_path', old_path, 'new_path', new_path)), '[]'::jsonb)
      into v_pairs
      from src;

    -- Apply the edit's content_item-level fields, repoint to v2, bounce for re-review.
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

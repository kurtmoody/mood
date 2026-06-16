-- Migration 0055 — split one channel off a multi-channel post into its own post.
--
-- A multi-channel post (0054) is one post with one approval shared across several of its
-- client's channels. Sometimes you want one of those channels to diverge — its own copy,
-- edited and approved independently. split_post_channel peels a single channel into a fresh
-- DRAFT post: same title/content_type/schedule, a v1 cloning the original's current body +
-- visual_content (NOT the internal note), and a clone of the current version's media under
-- new storage paths — mirroring update_post's fork media-copy contract exactly (returns the
-- {old_path,new_path} pairs so the server action copies the objects). The original simply
-- loses that channel; its status and content are untouched.
--
-- post_group_id links siblings that came from the same origin (null = not split). Writes are
-- RPC-only and agency-for-client; SECURITY DEFINER, set search_path = '', idempotent.

-- ---------- 1. group column ----------
alter table public.content_item add column if not exists post_group_id uuid;
create index if not exists idx_content_item_post_group on public.content_item (post_group_id);

-- ---------- 2. split_post_channel (agency-for-client; new draft, no change to the original) ----------
create or replace function public.split_post_channel(p_item_id uuid, p_channel_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_client       uuid;
  v_version      uuid;   -- the original's current version
  v_orig_channel uuid;   -- the original's denormalised primary
  v_count        int;
  v_group        uuid;
  v_new_item     uuid;
  v_new_ver      uuid;
  v_remaining    uuid;
  v_pairs        jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'split_post_channel: not authenticated'; end if;

  select client_id, current_version_id, channel_id
    into v_client, v_version, v_orig_channel
    from public.content_item where id = p_item_id;
  if v_client is null then raise exception 'split_post_channel: post not found'; end if;
  -- Agency-for-client only: this is false for client users, so they are rejected here.
  if not public.is_agency_for_client(v_client) then raise exception 'split_post_channel: not authorised'; end if;

  -- Need ≥2 channels — you can't split the only (or no) channel.
  select count(*) into v_count from public.content_item_channel where content_item_id = p_item_id;
  if v_count < 2 then raise exception 'split_post_channel: post must have at least two channels to split'; end if;

  -- The channel must be on this post.
  if not exists (
    select 1 from public.content_item_channel where content_item_id = p_item_id and channel_id = p_channel_id
  ) then
    raise exception 'split_post_channel: channel is not on this post';
  end if;

  -- Group: reuse the original's, or create one and stamp it on the original.
  select post_group_id into v_group from public.content_item where id = p_item_id;
  if v_group is null then
    v_group := gen_random_uuid();
    update public.content_item set post_group_id = v_group where id = p_item_id;
  end if;

  -- New DRAFT post: same client/title/content_type/scheduled_at; channel_id = the split channel.
  insert into public.content_item (client_id, channel_id, title, content_type, scheduled_at, status, created_by, post_group_id)
  select ci.client_id, p_channel_id, ci.title, ci.content_type, ci.scheduled_at, 'draft', auth.uid(), v_group
    from public.content_item ci where ci.id = p_item_id
  returning id into v_new_item;

  -- Its single channel link.
  insert into public.content_item_channel (content_item_id, channel_id)
  values (v_new_item, p_channel_id)
  on conflict do nothing;

  -- v1 copying the original's current body + visual_content (the internal note is NOT copied).
  v_new_ver := gen_random_uuid();
  insert into public.content_version (id, content_item_id, version_no, body, visual_content, created_by)
  select v_new_ver, v_new_item, 1, cv.body, cv.visual_content, auth.uid()
    from public.content_version cv where cv.id = v_version;

  update public.content_item set current_version_id = v_new_ver, updated_at = now() where id = v_new_item;

  -- Clone the current version's media onto the new v1 under new paths (the fork's convention),
  -- preserving mime_type + sort_order, and collect the {old_path,new_path} pairs.
  with src as (
    select m.storage_path as old_path, m.mime_type, m.size_bytes, m.sort_order,
           (v_client::text || '/' || v_new_item::text || '/' || v_new_ver::text || '/' ||
            substring(m.storage_path from '[^/]+$')) as new_path
      from public.media m
     where m.version_id = v_version
  ),
  ins as (
    insert into public.media (version_id, storage_path, mime_type, size_bytes, created_by, sort_order)
    select v_new_ver, new_path, mime_type, size_bytes, auth.uid(), sort_order from src
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('old_path', old_path, 'new_path', new_path)), '[]'::jsonb)
    into v_pairs
    from src;

  -- Detach the channel from the original. Status + content stay untouched.
  delete from public.content_item_channel where content_item_id = p_item_id and channel_id = p_channel_id;

  -- If the original's denormalised primary was the split-off channel, repoint it to a remaining one.
  if v_orig_channel = p_channel_id then
    select channel_id into v_remaining
      from public.content_item_channel where content_item_id = p_item_id order by channel_id limit 1;
    update public.content_item set channel_id = v_remaining, updated_at = now() where id = p_item_id;
  end if;

  return jsonb_build_object('new_item_id', v_new_item, 'media', v_pairs);
end; $$;

-- ---------- 3. refresh the PostgREST schema cache ----------
notify pgrst, 'reload schema';

-- Migration 0054 — one post targeting multiple channels (data foundation).
--
-- A post currently carries a single denormalised content_item.channel_id. This adds a
-- content_item_channel join table so a post can target several of its client's channels,
-- while keeping channel_id as the "primary" channel (first in the set) so existing reads
-- (calendar chips, etc.) keep working unchanged. No UI in this migration.
--
-- RLS: a link row is visible exactly when its post is — the read policy proxies to
-- content_item's own RLS (0015 read floor), so agency sees any status, clients only from
-- client_review onward. Writes are RPC-only (set_post_channels / create_post).
--
-- Backward-compatible: create_post's new p_channel_ids defaults to '{}', so existing callers
-- (single p_channel_id) are unaffected. Duplicate-function trap respected: create_post's exact
-- 0052 signature is dropped first, then the full 0052 body recreated + the new param.

-- ---------- 1. content_item_channel join table ----------
create table if not exists public.content_item_channel (
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  channel_id      uuid not null references public.channel(id) on delete cascade,
  primary key (content_item_id, channel_id)
);
create index if not exists idx_content_item_channel_channel on public.content_item_channel (channel_id);

alter table public.content_item_channel enable row level security;

-- Read floor by proxy: visible when the post is visible to the user. The subquery re-applies
-- content_item's own RLS (0015), so no status logic is duplicated here.
drop policy if exists content_item_channel_read on public.content_item_channel;
create policy content_item_channel_read on public.content_item_channel
  for select using (content_item_id in (select id from public.content_item));
-- No write policy — writes go only through set_post_channels / create_post (SECURITY DEFINER).

-- ---------- 2. backfill from the denormalised channel_id ----------
insert into public.content_item_channel (content_item_id, channel_id)
  select id, channel_id from public.content_item where channel_id is not null
  on conflict do nothing;

-- ---------- 3. set_post_channels (agency-for-client; no fork, no status change) ----------
create or replace function public.set_post_channels(p_item_id uuid, p_channel_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
  c        uuid;
begin
  if auth.uid() is null then raise exception 'set_post_channels: not authenticated'; end if;

  select client_id into v_client from public.content_item where id = p_item_id;
  if v_client is null then raise exception 'set_post_channels: post not found'; end if;
  -- Agency-for-client only: this is false for client users, so they are rejected here.
  if not public.is_agency_for_client(v_client) then raise exception 'set_post_channels: not authorised'; end if;

  if p_channel_ids is null or array_length(p_channel_ids, 1) is null then
    raise exception 'set_post_channels: at least one channel is required';
  end if;

  -- Every channel must belong to this post's client.
  foreach c in array p_channel_ids loop
    if not exists (select 1 from public.channel ch where ch.id = c and ch.client_id = v_client) then
      raise exception 'set_post_channels: channel does not belong to this client';
    end if;
  end loop;

  -- Replace the join rows with exactly the given set.
  delete from public.content_item_channel where content_item_id = p_item_id;
  insert into public.content_item_channel (content_item_id, channel_id)
    select p_item_id, x from unnest(p_channel_ids) as x
    on conflict do nothing;

  -- Denormalised primary channel = the first id in the array.
  update public.content_item set channel_id = p_channel_ids[1], updated_at = now() where id = p_item_id;
end; $$;

-- ---------- 4. create_post (latest body = 0052) — append p_channel_ids ----------
drop function if exists public.create_post(uuid, uuid, text, text, timestamptz, text, text);

create function public.create_post(
  p_client_id      uuid,
  p_channel_id     uuid default null,
  p_title          text default null,
  p_content_type   text default 'post',
  p_scheduled_at   timestamptz default null,
  p_body           text default null,
  p_visual_content text default null,
  p_channel_ids    uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_item    uuid;
  v_ver     uuid;
  v_channel uuid;
  c         uuid;
begin
  if auth.uid() is null then raise exception 'create_post: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'create_post: not authorised'; end if;

  -- Channels (0054): an explicit p_channel_ids array wins — validate each belongs to the client
  -- and take the first as the denormalised channel_id; otherwise keep the single p_channel_id
  -- (its original, unvalidated behaviour, unchanged).
  if array_length(p_channel_ids, 1) is not null then
    foreach c in array p_channel_ids loop
      if not exists (select 1 from public.channel ch where ch.id = c and ch.client_id = p_client_id) then
        raise exception 'create_post: channel does not belong to this client';
      end if;
    end loop;
    v_channel := p_channel_ids[1];
  else
    v_channel := p_channel_id;
  end if;

  insert into public.content_item (client_id, channel_id, title, content_type, scheduled_at, status, created_by)
  values (p_client_id, v_channel, p_title, coalesce(nullif(p_content_type,''),'post'), p_scheduled_at, 'draft', auth.uid())
  returning id into v_item;

  insert into public.content_version (content_item_id, version_no, body, visual_content, created_by)
  values (v_item, 1, p_body, p_visual_content, auth.uid())
  returning id into v_ver;

  update public.content_item set current_version_id = v_ver, updated_at = now() where id = v_item;

  -- Join rows: one per channel in the array, or one for the single channel when set.
  if array_length(p_channel_ids, 1) is not null then
    insert into public.content_item_channel (content_item_id, channel_id)
      select v_item, x from unnest(p_channel_ids) as x
      on conflict do nothing;
  elsif p_channel_id is not null then
    insert into public.content_item_channel (content_item_id, channel_id)
      values (v_item, p_channel_id)
      on conflict do nothing;
  end if;

  return v_item;
end; $$;

-- ---------- 5. refresh the PostgREST schema cache ----------
notify pgrst, 'reload schema';

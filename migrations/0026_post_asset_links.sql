-- Migration 0026 — labelled asset links on posts.
--
-- Mirrors the media feature: a child table of content_item, a status-aware read floor
-- (same shape as 0015), and RPC-only writes (no permissive write policies). Links are
-- secondary metadata (Drive folders, raw footage, final exports, …).

create table if not exists public.post_asset_link (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  label           text not null,
  url             text not null,
  sort_order      int not null default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now()
);

create index if not exists idx_post_asset_link_item_sort on public.post_asset_link (content_item_id, sort_order);

-- ---------- RLS: read floor mirroring 0015 ----------
alter table public.post_asset_link enable row level security;

-- Agency: their clients' rows, any status. Client: only for their own client's posts
-- AND only from client_review onward. No write policies — writes go via the RPCs below.
drop policy if exists post_asset_link_select on public.post_asset_link;
create policy post_asset_link_select on public.post_asset_link
  for select to authenticated
  using (
    exists (
      select 1 from public.content_item ci
       where ci.id = post_asset_link.content_item_id
         and (
           public.is_agency_for_client(ci.client_id)
           or (
             (select public.is_client_user())
             and ci.client_id in (select public.client_ids_for_user())
             and ci.status in ('client_review','changes_requested','approved','scheduled','posted')
           )
         )
    )
  );

-- ---------- RPCs (SECURITY DEFINER; authorise in body) ----------
create or replace function public.add_asset_link(p_content_item_id uuid, p_label text, p_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'add_asset_link: not authenticated'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'add_asset_link: label required'; end if;
  if coalesce(btrim(p_url), '') = '' then raise exception 'add_asset_link: url required'; end if;
  select client_id into v_client from public.content_item where id = p_content_item_id;
  if v_client is null then raise exception 'add_asset_link: post not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'add_asset_link: not authorised'; end if;

  insert into public.post_asset_link (content_item_id, label, url, sort_order, created_by)
  values (p_content_item_id, btrim(p_label), btrim(p_url),
          coalesce((select max(sort_order) + 1 from public.post_asset_link where content_item_id = p_content_item_id), 0),
          auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_asset_link(p_link_id uuid, p_label text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'update_asset_link: not authenticated'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'update_asset_link: label required'; end if;
  if coalesce(btrim(p_url), '') = '' then raise exception 'update_asset_link: url required'; end if;
  select ci.client_id into v_client
    from public.post_asset_link l join public.content_item ci on ci.id = l.content_item_id
   where l.id = p_link_id;
  if v_client is null then raise exception 'update_asset_link: link not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_asset_link: not authorised'; end if;
  update public.post_asset_link set label = btrim(p_label), url = btrim(p_url) where id = p_link_id;
end; $$;

create or replace function public.delete_asset_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_asset_link: not authenticated'; end if;
  select ci.client_id into v_client
    from public.post_asset_link l join public.content_item ci on ci.id = l.content_item_id
   where l.id = p_link_id;
  if v_client is null then raise exception 'delete_asset_link: link not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'delete_asset_link: not authorised'; end if;
  delete from public.post_asset_link where id = p_link_id;
end; $$;

-- Agency-only (a client member is not is_agency_for_client); only touches this post's links.
create or replace function public.reorder_asset_link(p_content_item_id uuid, p_ordered_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'reorder_asset_link: not authenticated'; end if;
  select client_id into v_client from public.content_item where id = p_content_item_id;
  if v_client is null then raise exception 'reorder_asset_link: post not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'reorder_asset_link: not authorised'; end if;

  update public.post_asset_link l
     set sort_order = ord.idx
    from (select id, (ordinality - 1)::int as idx from unnest(p_ordered_ids) with ordinality as t(id, ordinality)) ord
   where l.id = ord.id and l.content_item_id = p_content_item_id;
end; $$;

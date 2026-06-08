-- Migration 0018 — media storage for content.
--
-- Media rows attach to content_version and live in a PRIVATE Storage bucket
-- (content-media) accessed via signed URLs. Agency uploads only; client users are
-- read-only and inherit the 0015 visibility rules (own client, client_review+).
--
-- SECURITY-SENSITIVE (storage access control):
--  * Table + storage SELECT mirror the 0015 read floor.
--  * Writes (DB rows) go through SECURITY DEFINER RPCs only (no write policies),
--    consistent with the 0016 RPC-only design.
--  * Storage object writes are gated by storage.objects policies that parse the
--    path (<client_id>/<content_item_id>/<version_id>/<filename>) to authorise.

-- ---------- 1. media table ----------
create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.content_version(id) on delete cascade,
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint,
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now()
);

create index if not exists idx_media_version_id on public.media (version_id);

-- ---------- 2. RLS: SELECT mirrors the content read floor (0015) ----------
alter table public.media enable row level security;

drop policy if exists media_select on public.media;
create policy media_select on public.media
  for select to authenticated
  using (
    exists (
      select 1
        from public.content_version cv
        join public.content_item ci on ci.id = cv.content_item_id
       where cv.id = media.version_id
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

-- No INSERT/UPDATE/DELETE policies: media rows are written only via the SECURITY
-- DEFINER RPCs below (which bypass RLS). Do NOT add write policies here.

-- ---------- 3. write RPCs (agency-only, enforced in the function) ----------
create or replace function public.add_media(
  p_version_id   uuid,
  p_storage_path text,
  p_mime_type    text default null,
  p_size_bytes   bigint default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'add_media: not authenticated'; end if;

  select ci.client_id into v_client
    from public.content_version cv
    join public.content_item ci on ci.id = cv.content_item_id
   where cv.id = p_version_id;
  if v_client is null then raise exception 'add_media: version not found'; end if;

  if not public.is_agency_for_client(v_client) then
    raise exception 'add_media: not authorised';
  end if;

  insert into public.media (version_id, storage_path, mime_type, size_bytes, created_by)
  values (p_version_id, p_storage_path, p_mime_type, p_size_bytes, auth.uid())
  returning id into v_id;

  return v_id;
end; $$;

-- Removes the DB row only. Deleting the Storage object is a separate Storage API
-- call (governed by the DELETE policy below) and is the caller's responsibility.
create or replace function public.delete_media(p_media_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'delete_media: not authenticated'; end if;

  select ci.client_id into v_client
    from public.media m
    join public.content_version cv on cv.id = m.version_id
    join public.content_item ci on ci.id = cv.content_item_id
   where m.id = p_media_id;
  if v_client is null then return; end if;

  if not public.is_agency_for_client(v_client) then
    raise exception 'delete_media: not authorised';
  end if;

  delete from public.media where id = p_media_id;
end; $$;

-- ---------- 4. private Storage bucket ----------
insert into storage.buckets (id, name, public)
values ('content-media', 'content-media', false)
on conflict (id) do nothing;

-- ---------- 5. storage.objects policies for the content-media bucket ----------
-- Path: <client_id>/<content_item_id>/<version_id>/<filename>.
-- (storage.foldername(name))[1] = client_id; [2] = content_item_id.

-- INSERT (upload): agency for the client in segment 1 only.
drop policy if exists content_media_insert on storage.objects;
create policy content_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-media'
    and public.is_agency_for_client(((storage.foldername(name))[1])::uuid)
  );

-- SELECT (signed-URL generation / download): mirrors media_select EXACTLY,
-- including the status gate. The content_item is found via segment 2
-- (content_item_id) of the path, so a client can never mint/download a signed URL
-- for media on a draft / internal_review post — storage matches the table.
drop policy if exists content_media_select on storage.objects;
create policy content_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'content-media'
    and exists (
      select 1 from public.content_item ci
       where ci.id = ((storage.foldername(name))[2])::uuid
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

-- DELETE: agency for the client in segment 1 only.
drop policy if exists content_media_delete on storage.objects;
create policy content_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content-media'
    and public.is_agency_for_client(((storage.foldername(name))[1])::uuid)
  );

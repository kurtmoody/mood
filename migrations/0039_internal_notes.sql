-- Migration 0039 — internal notes on posts + tasks (one polymorphic, agency-only table).
--
-- A single table backs notes on two parent kinds (content_item and task). parent_id is
-- polymorphic (NO FK — it points at different tables by parent_type), so there is no FK
-- safety net: the RLS read policy and the write RPCs BOTH resolve the parent's agency
-- per-row and gate on agency membership. No client path anywhere — these are internal.

create table if not exists public.internal_note (
  id          uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('post','task')),
  parent_id   uuid not null,
  author_id   uuid references auth.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists idx_internal_note_parent
  on public.internal_note (parent_type, parent_id, created_at);

-- Per-row visibility: resolve the parent's agency by type, then check agency membership.
-- post → content_item → client → agency (is_agency_for_client);  task → task.agency_id.
-- A missing parent yields null → the helpers return false → fails closed.
create or replace function public.can_see_internal_note(p_parent_type text, p_parent_id uuid)
returns boolean
language sql security definer stable set search_path = ''
as $$
  select case
    when p_parent_type = 'post' then
      public.is_agency_for_client((select client_id from public.content_item where id = p_parent_id))
    when p_parent_type = 'task' then
      public.is_agency_member((select agency_id from public.task where id = p_parent_id))
    else false
  end;
$$;

alter table public.internal_note enable row level security;

-- Read-only policy; writes go through the RPCs below (no write policies).
drop policy if exists internal_note_read on public.internal_note;
create policy internal_note_read on public.internal_note
  for select using (public.can_see_internal_note(parent_type, parent_id));

-- ---------- write: add (agency member of the parent's agency) ----------
create or replace function public.add_internal_note(
  p_parent_type text, p_parent_id uuid, p_body text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'add_internal_note: not authenticated'; end if;
  if p_parent_type not in ('post','task') then
    raise exception 'add_internal_note: invalid parent_type %', p_parent_type;
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'add_internal_note: body is required';
  end if;

  -- Resolve the parent's agency (no FK — must look it up by type).
  if p_parent_type = 'post' then
    select c.agency_id into v_agency
      from public.content_item ci
      join public.client c on c.id = ci.client_id
     where ci.id = p_parent_id;
  else
    select agency_id into v_agency from public.task where id = p_parent_id;
  end if;
  if v_agency is null then raise exception 'add_internal_note: parent not found'; end if;
  if not public.is_agency_member(v_agency) then
    raise exception 'add_internal_note: not authorised';
  end if;

  insert into public.internal_note (parent_type, parent_id, author_id, body)
  values (p_parent_type, p_parent_id, v_uid, btrim(p_body))
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- write: edit (author only) ----------
create or replace function public.update_internal_note(p_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'update_internal_note: not authenticated'; end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'update_internal_note: body is required';
  end if;
  update public.internal_note
     set body = btrim(p_body), updated_at = now()
   where id = p_id and author_id = v_uid;
  if not found then raise exception 'update_internal_note: not found or not the author'; end if;
end; $$;

-- ---------- write: delete (author only) ----------
create or replace function public.delete_internal_note(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'delete_internal_note: not authenticated'; end if;
  delete from public.internal_note where id = p_id and author_id = v_uid;
  if not found then raise exception 'delete_internal_note: not found or not the author'; end if;
end; $$;

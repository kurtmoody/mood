-- Migration 0044 — internal time logging (timesheets, sub-slice 1): manual entries +
-- a DB-backed running timer, against a task or directly against a client. Agency-only;
-- NO client visibility in this slice.
--
-- timesheet_enabled gates the UI surfacing only — the write RPCs are permissive (a display
-- preference shouldn't break an in-flight timer if toggled off). One running timer per user
-- is enforced by a partial unique index (race-proof) + a friendly pre-check in start_timer.

alter table public.client add column if not exists timesheet_enabled boolean not null default false;

create table if not exists public.time_entry (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agency(id) on delete cascade,
  client_id        uuid not null references public.client(id) on delete cascade,
  task_id          uuid references public.task(id) on delete set null,  -- task-linked or client-direct
  user_id          uuid not null references auth.users(id) on delete cascade,
  started_at       timestamptz not null,
  ended_at         timestamptz,                                         -- null = running
  duration_minutes int,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_time_entry_client on public.time_entry (client_id, started_at);
create index if not exists idx_time_entry_user_open on public.time_entry (user_id, ended_at);
-- At most one running timer per user.
create unique index if not exists time_entry_one_running on public.time_entry (user_id) where ended_at is null;

alter table public.time_entry enable row level security;

-- Read: agency members of the entry's agency (no client path in this slice). Writes RPC-only.
drop policy if exists time_entry_read on public.time_entry;
create policy time_entry_read on public.time_entry
  for select using (public.is_agency_member(agency_id));

-- ---------- helpers shared by the RPCs ----------
-- duration in whole minutes between two instants.
create or replace function public._minutes_between(p_start timestamptz, p_end timestamptz)
returns int language sql immutable set search_path = '' as $$
  select round(extract(epoch from (p_end - p_start)) / 60.0)::int;
$$;

-- ---------- start_timer ----------
create or replace function public.start_timer(p_client_id uuid, p_task_id uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'start_timer: not authenticated'; end if;

  select agency_id into v_agency from public.client where id = p_client_id;
  if v_agency is null then raise exception 'start_timer: client not found'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'start_timer: not authorised'; end if;

  if p_task_id is not null and not exists (
       select 1 from public.task t where t.id = p_task_id and t.agency_id = v_agency and t.client_id = p_client_id
     ) then raise exception 'start_timer: task does not belong to this client'; end if;

  if exists (select 1 from public.time_entry e where e.user_id = v_uid and e.ended_at is null) then
    raise exception 'start_timer: stop your running timer first';
  end if;

  insert into public.time_entry (agency_id, client_id, task_id, user_id, started_at, note)
  values (v_agency, p_client_id, p_task_id, v_uid, now(), p_note)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- stop_timer (owner-only; accepts an explicit end to fix a forgotten timer) ----------
create or replace function public.stop_timer(p_entry_id uuid, p_ended_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_started timestamptz; v_ended_existing timestamptz; v_end timestamptz;
begin
  if v_uid is null then raise exception 'stop_timer: not authenticated'; end if;
  select user_id, started_at, ended_at into v_owner, v_started, v_ended_existing
    from public.time_entry where id = p_entry_id;
  if v_owner is null then raise exception 'stop_timer: entry not found'; end if;
  if v_owner <> v_uid then raise exception 'stop_timer: not your timer'; end if;
  if v_ended_existing is not null then raise exception 'stop_timer: already stopped'; end if;

  v_end := coalesce(p_ended_at, now());
  if v_end <= v_started then raise exception 'stop_timer: end must be after start'; end if;

  update public.time_entry
     set ended_at = v_end, duration_minutes = public._minutes_between(v_started, v_end)
   where id = p_entry_id;
end; $$;

-- ---------- log_time (manual completed entry) ----------
create or replace function public.log_time(
  p_client_id uuid, p_task_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'log_time: not authenticated'; end if;
  if p_started_at is null or p_ended_at is null then raise exception 'log_time: start and end are required'; end if;
  if p_ended_at <= p_started_at then raise exception 'log_time: end must be after start'; end if;

  select agency_id into v_agency from public.client where id = p_client_id;
  if v_agency is null then raise exception 'log_time: client not found'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'log_time: not authorised'; end if;
  if p_task_id is not null and not exists (
       select 1 from public.task t where t.id = p_task_id and t.agency_id = v_agency and t.client_id = p_client_id
     ) then raise exception 'log_time: task does not belong to this client'; end if;

  insert into public.time_entry (agency_id, client_id, task_id, user_id, started_at, ended_at, duration_minutes, note)
  values (v_agency, p_client_id, p_task_id, v_uid, p_started_at, p_ended_at,
          public._minutes_between(p_started_at, p_ended_at), p_note)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- update_time_entry (owner-only) ----------
create or replace function public.update_time_entry(
  p_entry_id uuid, p_task_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_agency uuid; v_client uuid;
begin
  if v_uid is null then raise exception 'update_time_entry: not authenticated'; end if;
  select user_id, agency_id, client_id into v_owner, v_agency, v_client
    from public.time_entry where id = p_entry_id;
  if v_owner is null then raise exception 'update_time_entry: entry not found'; end if;
  if v_owner <> v_uid then raise exception 'update_time_entry: not your entry'; end if;
  if p_started_at is null then raise exception 'update_time_entry: start is required'; end if;
  -- ended_at may be null (still running). If set, it must be after start.
  if p_ended_at is not null and p_ended_at <= p_started_at then
    raise exception 'update_time_entry: end must be after start';
  end if;
  if p_task_id is not null and not exists (
       select 1 from public.task t where t.id = p_task_id and t.agency_id = v_agency and t.client_id = v_client
     ) then raise exception 'update_time_entry: task does not belong to this client'; end if;

  update public.time_entry
     set task_id = p_task_id, started_at = p_started_at, ended_at = p_ended_at,
         duration_minutes = case when p_ended_at is null then null else public._minutes_between(p_started_at, p_ended_at) end,
         note = p_note
   where id = p_entry_id;
end; $$;

-- ---------- set_client_timesheet_enabled (admin-only) ----------
-- Toggles the per-client UI flag. Admin-level config → agency_admin of the client's agency.
create or replace function public.set_client_timesheet_enabled(p_client_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'set_client_timesheet_enabled: not authenticated'; end if;
  if p_enabled is null then raise exception 'set_client_timesheet_enabled: enabled flag required'; end if;
  select agency_id into v_agency from public.client where id = p_client_id;
  if v_agency is null then raise exception 'set_client_timesheet_enabled: client not found'; end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency' and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'set_client_timesheet_enabled: not authorised'; end if;
  update public.client set timesheet_enabled = p_enabled where id = p_client_id;
end; $$;

-- ---------- delete_time_entry (owner-only) ----------
create or replace function public.delete_time_entry(p_entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'delete_time_entry: not authenticated'; end if;
  select user_id into v_owner from public.time_entry where id = p_entry_id;
  if v_owner is null then raise exception 'delete_time_entry: entry not found'; end if;
  if v_owner <> v_uid then raise exception 'delete_time_entry: not your entry'; end if;
  delete from public.time_entry where id = p_entry_id;
end; $$;

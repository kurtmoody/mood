-- Migration 0028 — internal task table + RPCs (Slice 2).
--
-- Internal management layer: agency-scoped, agency-only. Clients never see tasks
-- (no client branch in the read policy). RPC-only writes. Status/priority/type values
-- are validated in the app via lib/taskConstants.ts (stored as free text here).

-- ---------- table ----------
create table if not exists public.task (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agency(id),
  client_id   uuid references public.client(id) on delete set null,  -- nullable: some tasks are internal
  task_type   text,
  title       text not null,
  owner_id    uuid references public.team_member(id),
  status      text not null default 'Not Started',
  priority    text default 'Medium',
  due_date    date,
  next_action text,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_task_agency on public.task (agency_id);
create index if not exists idx_task_owner  on public.task (owner_id);

-- ---------- RLS: agency-scoped read, internal-only, no writes ----------
alter table public.task enable row level security;

drop policy if exists task_read on public.task;
create policy task_read on public.task
  for select using (public.is_agency_member(agency_id));
-- No client branch (tasks are never client-visible) and no write policies (RPCs below).

-- ---------- RPCs (SECURITY DEFINER; agency-authorise in body) ----------
-- create_task derives the agency from the caller's membership (like create_client).
create or replace function public.create_task(
  p_client_id   uuid default null,
  p_task_type   text default null,
  p_title       text default null,
  p_owner_id    uuid default null,
  p_status      text default 'Not Started',
  p_priority    text default 'Medium',
  p_due_date    date default null,
  p_next_action text default null,
  p_notes       text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'create_task: not authenticated'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'create_task: title required'; end if;

  select m.scope_id into v_agency
    from public.membership m
   where m.user_id = v_uid and m.scope_type = 'agency' and m.role in ('agency_admin','agency_member')
   order by m.created_at limit 1;
  if v_agency is null then raise exception 'create_task: no agency membership'; end if;

  if p_client_id is not null and not exists (
       select 1 from public.client c where c.id = p_client_id and c.agency_id = v_agency
     ) then raise exception 'create_task: client not in your agency'; end if;
  if p_owner_id is not null and not exists (
       select 1 from public.team_member tm where tm.id = p_owner_id and tm.agency_id = v_agency
     ) then raise exception 'create_task: owner not in your agency'; end if;

  insert into public.task (agency_id, client_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, created_by)
  values (v_agency, p_client_id, p_task_type, btrim(p_title), p_owner_id,
          coalesce(nullif(btrim(p_status), ''), 'Not Started'),
          coalesce(nullif(btrim(p_priority), ''), 'Medium'),
          p_due_date, p_next_action, p_notes, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

-- update_task is a full replace (the form sends all fields; mark-complete re-sends them
-- with status = Complete). Authorised against the task's own agency.
create or replace function public.update_task(
  p_task_id     uuid,
  p_client_id   uuid default null,
  p_task_type   text default null,
  p_title       text default null,
  p_owner_id    uuid default null,
  p_status      text default null,
  p_priority    text default null,
  p_due_date    date default null,
  p_next_action text default null,
  p_notes       text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'update_task: not authenticated'; end if;
  select agency_id into v_agency from public.task where id = p_task_id;
  if v_agency is null then raise exception 'update_task: task not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'update_task: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'update_task: title required'; end if;
  if p_client_id is not null and not exists (
       select 1 from public.client c where c.id = p_client_id and c.agency_id = v_agency
     ) then raise exception 'update_task: client not in your agency'; end if;
  if p_owner_id is not null and not exists (
       select 1 from public.team_member tm where tm.id = p_owner_id and tm.agency_id = v_agency
     ) then raise exception 'update_task: owner not in your agency'; end if;

  update public.task set
    client_id = p_client_id, task_type = p_task_type, title = btrim(p_title), owner_id = p_owner_id,
    status = coalesce(nullif(btrim(p_status), ''), 'Not Started'),
    priority = coalesce(nullif(btrim(p_priority), ''), 'Medium'),
    due_date = p_due_date, next_action = p_next_action, notes = p_notes, updated_at = now()
  where id = p_task_id;
end; $$;

create or replace function public.delete_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'delete_task: not authenticated'; end if;
  select agency_id into v_agency from public.task where id = p_task_id;
  if v_agency is null then raise exception 'delete_task: task not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'delete_task: not authorised'; end if;
  delete from public.task where id = p_task_id;
end; $$;

-- Migration 0031 — link tasks to content_items (manual; no auto-spawn yet).
--
-- Adds task.content_item_id (nullable, on delete set null — deleting a post keeps its
-- tasks, they just lose the link) and threads it through create_task / update_task.
-- Everything else about those RPCs is unchanged. No new RLS (task is already
-- agency-only; this is just a column). The added param changes each signature, so we
-- drop the EXACT existing signature and recreate (as with create_client).

-- ---------- column ----------
alter table public.task add column if not exists content_item_id uuid references public.content_item(id) on delete set null;
create index if not exists idx_task_content_item on public.task (content_item_id);

-- ---------- create_task (+ p_content_item_id) ----------
drop function if exists public.create_task(uuid, text, text, uuid, text, text, date, text, text);

create function public.create_task(
  p_client_id       uuid default null,
  p_task_type       text default null,
  p_title           text default null,
  p_owner_id        uuid default null,
  p_status          text default 'Not Started',
  p_priority        text default 'Medium',
  p_due_date        date default null,
  p_next_action     text default null,
  p_notes           text default null,
  p_content_item_id uuid default null
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
  if p_content_item_id is not null and not exists (
       select 1 from public.content_item ci join public.client c on c.id = ci.client_id
        where ci.id = p_content_item_id and c.agency_id = v_agency
     ) then raise exception 'create_task: content item not in your agency'; end if;

  insert into public.task (agency_id, client_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, content_item_id, created_by)
  values (v_agency, p_client_id, p_task_type, btrim(p_title), p_owner_id,
          coalesce(nullif(btrim(p_status), ''), 'Not Started'),
          coalesce(nullif(btrim(p_priority), ''), 'Medium'),
          p_due_date, p_next_action, p_notes, p_content_item_id, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- update_task (+ p_content_item_id) ----------
drop function if exists public.update_task(uuid, uuid, text, text, uuid, text, text, date, text, text);

create function public.update_task(
  p_task_id         uuid,
  p_client_id       uuid default null,
  p_task_type       text default null,
  p_title           text default null,
  p_owner_id        uuid default null,
  p_status          text default null,
  p_priority        text default null,
  p_due_date        date default null,
  p_next_action     text default null,
  p_notes           text default null,
  p_content_item_id uuid default null
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
  if p_content_item_id is not null and not exists (
       select 1 from public.content_item ci join public.client c on c.id = ci.client_id
        where ci.id = p_content_item_id and c.agency_id = v_agency
     ) then raise exception 'update_task: content item not in your agency'; end if;

  update public.task set
    client_id = p_client_id, task_type = p_task_type, title = btrim(p_title), owner_id = p_owner_id,
    status = coalesce(nullif(btrim(p_status), ''), 'Not Started'),
    priority = coalesce(nullif(btrim(p_priority), ''), 'Medium'),
    due_date = p_due_date, next_action = p_next_action, notes = p_notes,
    content_item_id = p_content_item_id, updated_at = now()
  where id = p_task_id;
end; $$;

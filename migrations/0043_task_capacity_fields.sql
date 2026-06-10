-- Migration 0043 — capacity-planning fields on task (sub-slice 1): estimated_hours + start_date.
--
-- Field layer for an upcoming capacity dashboard that will spread a task's estimated_hours
-- evenly across the weeks from start_date to due_date — so both must persist cleanly and be
-- queryable. This slice only adds the fields + form/grid surfacing; NOT the dashboard.
--
-- create_task / update_task were last changed in 0041 (which added subscription seeding +
-- _notify_task events). Adding params changes the signature, so `create or replace` would
-- leave a stale overload — we DROP the exact 0041 signatures first, then recreate the FULL
-- 0041 bodies verbatim with the two new trailing params + validation. All existing
-- behaviour (auth, agency validation, subscriber seeding, assignment/status notifications)
-- is preserved.

alter table public.task add column if not exists estimated_hours numeric;
alter table public.task add column if not exists start_date      date;

-- ---------- create_task (0041 body + estimated_hours + start_date) ----------
drop function if exists public.create_task(uuid, text, text, uuid, text, text, date, text, text, uuid);

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
  p_content_item_id uuid default null,
  p_estimated_hours numeric default null,
  p_start_date      date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid; v_label text;
begin
  if v_uid is null then raise exception 'create_task: not authenticated'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'create_task: title required'; end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then
    raise exception 'create_task: estimated_hours must be >= 0';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'create_task: start_date must be on or before due_date';
  end if;

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

  insert into public.task (agency_id, client_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, content_item_id, estimated_hours, start_date, created_by)
  values (v_agency, p_client_id, p_task_type, btrim(p_title), p_owner_id,
          coalesce(nullif(btrim(p_status), ''), 'Not Started'),
          coalesce(nullif(btrim(p_priority), ''), 'Medium'),
          p_due_date, p_next_action, p_notes, p_content_item_id, p_estimated_hours, p_start_date, v_uid)
  returning id into v_id;

  -- Seed subscribers, then (if assigned) notify them of the assignment (email-eligible).
  perform public._seed_task_subscribers(v_id);
  if p_owner_id is not null then
    v_label := coalesce((select name from public.client where id = p_client_id) || ' — ', '')
               || '"' || btrim(p_title) || '"';
    perform public._notify_task(
      (select array_agg(user_id) from public.task_subscriber where task_id = v_id),
      'task_assigned', v_id, v_uid,
      v_label || ': assigned to ' || coalesce((select full_name from public.team_member where id = p_owner_id), 'someone'),
      true);
  end if;

  return v_id;
end; $$;

-- ---------- update_task (0041 body + estimated_hours + start_date) ----------
drop function if exists public.update_task(uuid, uuid, text, text, uuid, text, text, date, text, text, uuid);

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
  p_content_item_id uuid default null,
  p_estimated_hours numeric default null,
  p_start_date      date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_agency uuid;
  v_old_owner uuid; v_old_status text; v_new_status text; v_label text;
begin
  if v_uid is null then raise exception 'update_task: not authenticated'; end if;
  select agency_id, owner_id, status into v_agency, v_old_owner, v_old_status
    from public.task where id = p_task_id;
  if v_agency is null then raise exception 'update_task: task not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'update_task: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'update_task: title required'; end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then
    raise exception 'update_task: estimated_hours must be >= 0';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'update_task: start_date must be on or before due_date';
  end if;
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

  v_new_status := coalesce(nullif(btrim(p_status), ''), 'Not Started');

  update public.task set
    client_id = p_client_id, task_type = p_task_type, title = btrim(p_title), owner_id = p_owner_id,
    status = v_new_status,
    priority = coalesce(nullif(btrim(p_priority), ''), 'Medium'),
    due_date = p_due_date, next_action = p_next_action, notes = p_notes,
    content_item_id = p_content_item_id, estimated_hours = p_estimated_hours, start_date = p_start_date,
    updated_at = now()
  where id = p_task_id;

  v_label := coalesce((select name from public.client where id = p_client_id) || ' — ', '')
             || '"' || btrim(p_title) || '"';

  -- Owner changed → re-seed derived subscribers (manual rows survive) + assignment event.
  if p_owner_id is distinct from v_old_owner then
    perform public._seed_task_subscribers(p_task_id);
    if p_owner_id is not null then
      perform public._notify_task(
        (select array_agg(user_id) from public.task_subscriber where task_id = p_task_id),
        'task_assigned', p_task_id, v_uid,
        v_label || ': assigned to ' || coalesce((select full_name from public.team_member where id = p_owner_id), 'someone'),
        true);
    end if;
  end if;

  -- Status changed → notify subscribers; email only for the meaningful statuses.
  if v_new_status is distinct from v_old_status then
    perform public._notify_task(
      (select array_agg(user_id) from public.task_subscriber where task_id = p_task_id),
      'task_status', p_task_id, v_uid,
      v_label || ' → ' || v_new_status,
      v_new_status in ('Complete','Waiting on Client','On Hold','Ready for Review'));
  end if;
end; $$;

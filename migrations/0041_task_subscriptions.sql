-- Migration 0041 — RACI-seeded task subscriptions + task event notifications (Phase 1).
--
-- Tasks gain subscribers (owner / accountable / creator, + future manual). On assignment
-- and on every status change we notify each subscriber except the actor. Notifications
-- reuse the existing `notification` table + bell; a new `email` flag marks rows in-app-only
-- vs in-app + email so we don't spam the team on every trivial status nudge.

-- ---------- notification: email flag + task link ----------
alter table public.notification add column if not exists email   boolean not null default true;
alter table public.notification add column if not exists task_id uuid references public.task(id) on delete cascade;

-- ---------- task_subscriber ----------
create table if not exists public.task_subscriber (
  task_id    uuid not null references public.task(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     text not null check (source in ('owner','accountable','creator','manual')),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table public.task_subscriber enable row level security;

-- Visible to agency members of the task's agency. Writes are RPC-only (no write policy).
drop policy if exists task_subscriber_read on public.task_subscriber;
create policy task_subscriber_read on public.task_subscriber
  for select using (
    exists (
      select 1 from public.task t
       where t.id = public.task_subscriber.task_id
         and public.is_agency_member(t.agency_id)
    )
  );

-- ---------- helper: who is Accountable for a task (user_id) ----------
-- Per-client Lead PM first; agency RACI 'A' (Accountable, incl. 'A/R') for the task_type
-- as fallback. Resolves to a team_member with a linked login; null if none.
create or replace function public._task_accountable_user(p_task_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_agency uuid; v_type text; v_user uuid;
begin
  select client_id, agency_id, task_type into v_client, v_agency, v_type
    from public.task where id = p_task_id;

  if v_client is not null then
    select tm.user_id into v_user
      from public.client_ownership co
      join public.team_member tm on tm.id = co.lead_pm_id
     where co.client_id = v_client and tm.user_id is not null;
    if v_user is not null then return v_user; end if;
  end if;

  if v_type is not null then
    select tm.user_id into v_user
      from public.raci_matrix r
      join public.team_member tm on tm.id = r.team_member_id
     where r.agency_id = v_agency and r.task_type = v_type
       and r.raci_value like '%A%' and tm.user_id is not null
     limit 1;
    if v_user is not null then return v_user; end if;
  end if;

  return null;
end; $$;

-- ---------- helper: (re)seed the derived subscribers ----------
-- Replaces the owner/accountable/creator rows from the task's current state; MANUAL rows
-- are never touched. One row per user — most specific source wins (owner > accountable >
-- creator); a pre-existing row for that user (e.g. manual) is left as-is.
create or replace function public._seed_task_subscribers(p_task_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_owner_user uuid; v_acct_user uuid; v_creator uuid;
begin
  delete from public.task_subscriber
   where task_id = p_task_id and source in ('owner','accountable','creator');

  select tm.user_id into v_owner_user
    from public.task t join public.team_member tm on tm.id = t.owner_id
   where t.id = p_task_id;

  v_acct_user := public._task_accountable_user(p_task_id);

  select created_by into v_creator from public.task where id = p_task_id;

  insert into public.task_subscriber (task_id, user_id, source)
  select p_task_id, d.user_id, d.source
    from (
      select distinct on (s.user_id) s.user_id, s.source
        from (values
          (v_owner_user,  'owner',       1),
          (v_acct_user,   'accountable', 2),
          (v_creator,     'creator',     3)
        ) as s(user_id, source, priority)
       where s.user_id is not null
       order by s.user_id, s.priority
    ) d
  on conflict (task_id, user_id) do nothing;
end; $$;

-- ---------- helper: notify a task's subscribers (skip the actor) ----------
create or replace function public._notify_task(
  p_user_ids uuid[], p_type text, p_task_id uuid, p_actor_id uuid, p_body text, p_email boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notification (user_id, type, task_id, actor_id, body, email)
  select u, p_type, p_task_id, p_actor_id, p_body, p_email
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
   where u is distinct from p_actor_id;
end; $$;

-- Which status changes are worth an email (everything else is in-app only).
-- assignment + Complete + Waiting on Client + On Hold + Ready for Review.
-- (Inlined in the RPCs below; documented here.)

-- ---------- create_task (0031 body + seeding + assignment event) ----------
create or replace function public.create_task(
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
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid; v_label text;
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

-- ---------- update_task (0031 body + owner re-seed + assignment/status events) ----------
create or replace function public.update_task(
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
    content_item_id = p_content_item_id, updated_at = now()
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

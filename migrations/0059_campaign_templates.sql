-- Migration 0059 — campaign templates (slice 5): reusable task blueprints with relative
-- scheduling, spawned into a campaign as ordinary tasks. Agency-only, no client surface.
--
-- A template is a named set of template-tasks, each with day offsets relative to the campaign's
-- start_date. spawn_campaign_tasks materialises them as REAL tasks (copies — no live link back),
-- computing dates from the campaign start and a suggested owner from RACI, and — crucially —
-- routing every row through the existing create_task RPC so the 0041 subscriber seeding and
-- assignment notifications fire identically to hand-made tasks.
--
-- Notes:
--  * create_task derives its agency from the caller's (first) agency membership — this assumes a
--    user belongs to one agency, which the RACI/ownership model already assumes. spawn is
--    agency-for-client authorised first, so the caller is an agency member of the campaign's agency.
--  * Double-spawn is REJECTED (accidental double-click is the real risk). Because spawned tasks are
--    pure copies with no template link, we detect a prior spawn via the campaign_template_spawn
--    ledger (unique per campaign×template).
--  * A campaign with no start_date spawns UNDATED tasks (they land in the timeline's Unscheduled
--    bucket) — the honest fallback, not an error.

-- ---------- 1. tables ----------
create table if not exists public.campaign_template (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agency(id),
  name       text not null,
  objective  text check (objective in ('awareness','traffic','leads','conversions','sales')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_campaign_template_agency on public.campaign_template (agency_id);

create table if not exists public.campaign_template_task (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.campaign_template(id) on delete cascade,
  title             text not null,
  task_type         text,
  estimated_hours   numeric,
  start_offset_days int,   -- days after the campaign's start_date (nullable)
  due_offset_days   int,   -- days after the campaign's start_date (nullable)
  sort_order        int not null default 0,
  constraint cmt_hours_nonneg  check (estimated_hours is null or estimated_hours >= 0),
  constraint cmt_offsets_nonneg check (
        (start_offset_days is null or start_offset_days >= 0)
    and (due_offset_days   is null or due_offset_days   >= 0)),
  constraint cmt_offset_order  check (
    start_offset_days is null or due_offset_days is null or start_offset_days <= due_offset_days)
);
create index if not exists idx_campaign_template_task_tmpl on public.campaign_template_task (template_id, sort_order);

-- Ledger: which template has been spawned into which campaign (idempotency guard; no task link).
create table if not exists public.campaign_template_spawn (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign(id) on delete cascade,
  template_id uuid not null references public.campaign_template(id) on delete cascade,
  task_count  int not null,
  spawned_by  uuid,
  spawned_at  timestamptz not null default now(),
  constraint uq_campaign_template_spawn unique (campaign_id, template_id)
);

-- ---------- 2. RLS: agency-member read; RPC-only writes ----------
alter table public.campaign_template       enable row level security;
alter table public.campaign_template_task  enable row level security;
alter table public.campaign_template_spawn enable row level security;

drop policy if exists campaign_template_read on public.campaign_template;
create policy campaign_template_read on public.campaign_template
  for select using (public.is_agency_member(agency_id));

-- Template-task visibility resolves through the template's agency. campaign_template is agency-only
-- (no client trap like 0058), so an ordinary subquery under the reader's RLS is safe here: an agency
-- member can read their agency's template rows; another agency's template resolves to empty → false.
drop policy if exists campaign_template_task_read on public.campaign_template_task;
create policy campaign_template_task_read on public.campaign_template_task
  for select using (
    exists (select 1 from public.campaign_template t
             where t.id = campaign_template_task.template_id
               and public.is_agency_member(t.agency_id))
  );

drop policy if exists campaign_template_spawn_read on public.campaign_template_spawn;
create policy campaign_template_spawn_read on public.campaign_template_spawn
  for select using (
    exists (select 1 from public.campaign c
             where c.id = campaign_template_spawn.campaign_id
               and public.is_agency_member(c.agency_id))
  );

-- ---------- 3. suggested-owner helper (team_member.id; RACI/Lead-PM, mirrors 0041 order) ----------
create or replace function public._suggested_task_owner(p_agency_id uuid, p_client_id uuid, p_task_type text)
returns uuid
language plpgsql security definer stable set search_path = ''
as $$
declare v_id uuid;
begin
  -- Client's Lead PM first (a directory-only member is fine as an owner — no user_id needed).
  if p_client_id is not null then
    select co.lead_pm_id into v_id
      from public.client_ownership co
     where co.client_id = p_client_id and co.lead_pm_id is not null;
    if v_id is not null then return v_id; end if;
  end if;
  -- Then the RACI accountable ('A') for this task_type in the agency.
  if p_task_type is not null then
    select r.team_member_id into v_id
      from public.raci_matrix r
     where r.agency_id = p_agency_id and r.task_type = p_task_type and r.raci_value like '%A%'
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  return null;
end; $$;

-- ---------- 4. template CRUD (any agency member; agency derived from caller) ----------
create or replace function public.create_campaign_template(p_name text, p_objective text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'create_campaign_template: not authenticated'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'create_campaign_template: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'create_campaign_template: invalid objective %', p_objective;
  end if;

  select m.scope_id into v_agency
    from public.membership m
   where m.user_id = v_uid and m.scope_type = 'agency' and m.role in ('agency_admin','agency_member')
   order by m.created_at limit 1;
  if v_agency is null then raise exception 'create_campaign_template: no agency membership'; end if;

  insert into public.campaign_template (agency_id, name, objective, created_by)
  values (v_agency, btrim(p_name), p_objective, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_campaign_template(p_id uuid, p_name text, p_objective text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'update_campaign_template: not authenticated'; end if;
  select agency_id into v_agency from public.campaign_template where id = p_id;
  if v_agency is null then raise exception 'update_campaign_template: template not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'update_campaign_template: not authorised'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'update_campaign_template: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'update_campaign_template: invalid objective %', p_objective;
  end if;

  update public.campaign_template set name = btrim(p_name), objective = p_objective, updated_at = now()
  where id = p_id;
end; $$;

create or replace function public.delete_campaign_template(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'delete_campaign_template: not authenticated'; end if;
  select agency_id into v_agency from public.campaign_template where id = p_id;
  if v_agency is null then raise exception 'delete_campaign_template: template not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'delete_campaign_template: not authorised'; end if;
  delete from public.campaign_template where id = p_id;
end; $$;

-- ---------- 5. template-task CRUD (agency member of the template's agency) ----------
create or replace function public.create_campaign_template_task(
  p_template_id       uuid,
  p_title             text,
  p_task_type         text    default null,
  p_estimated_hours   numeric default null,
  p_start_offset_days int     default null,
  p_due_offset_days   int     default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid; v_id uuid; v_sort int;
begin
  if auth.uid() is null then raise exception 'create_campaign_template_task: not authenticated'; end if;
  select agency_id into v_agency from public.campaign_template where id = p_template_id;
  if v_agency is null then raise exception 'create_campaign_template_task: template not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'create_campaign_template_task: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'create_campaign_template_task: title required'; end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then raise exception 'create_campaign_template_task: estimated_hours must be >= 0'; end if;
  if (p_start_offset_days is not null and p_start_offset_days < 0)
     or (p_due_offset_days is not null and p_due_offset_days < 0) then
    raise exception 'create_campaign_template_task: offsets must be >= 0';
  end if;
  if p_start_offset_days is not null and p_due_offset_days is not null and p_start_offset_days > p_due_offset_days then
    raise exception 'create_campaign_template_task: start offset must be on or before due offset';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_sort
    from public.campaign_template_task where template_id = p_template_id;

  insert into public.campaign_template_task (template_id, title, task_type, estimated_hours, start_offset_days, due_offset_days, sort_order)
  values (p_template_id, btrim(p_title), p_task_type, p_estimated_hours, p_start_offset_days, p_due_offset_days, v_sort)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_campaign_template_task(
  p_id                uuid,
  p_title             text,
  p_task_type         text    default null,
  p_estimated_hours   numeric default null,
  p_start_offset_days int     default null,
  p_due_offset_days   int     default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'update_campaign_template_task: not authenticated'; end if;
  select t.agency_id into v_agency
    from public.campaign_template_task ct join public.campaign_template t on t.id = ct.template_id
   where ct.id = p_id;
  if v_agency is null then raise exception 'update_campaign_template_task: task not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'update_campaign_template_task: not authorised'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'update_campaign_template_task: title required'; end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then raise exception 'update_campaign_template_task: estimated_hours must be >= 0'; end if;
  if (p_start_offset_days is not null and p_start_offset_days < 0)
     or (p_due_offset_days is not null and p_due_offset_days < 0) then
    raise exception 'update_campaign_template_task: offsets must be >= 0';
  end if;
  if p_start_offset_days is not null and p_due_offset_days is not null and p_start_offset_days > p_due_offset_days then
    raise exception 'update_campaign_template_task: start offset must be on or before due offset';
  end if;

  update public.campaign_template_task set
    title = btrim(p_title), task_type = p_task_type, estimated_hours = p_estimated_hours,
    start_offset_days = p_start_offset_days, due_offset_days = p_due_offset_days
  where id = p_id;
end; $$;

create or replace function public.delete_campaign_template_task(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'delete_campaign_template_task: not authenticated'; end if;
  select t.agency_id into v_agency
    from public.campaign_template_task ct join public.campaign_template t on t.id = ct.template_id
   where ct.id = p_id;
  if v_agency is null then raise exception 'delete_campaign_template_task: task not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'delete_campaign_template_task: not authorised'; end if;
  delete from public.campaign_template_task where id = p_id;
end; $$;

create or replace function public.reorder_campaign_template_task(p_template_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'reorder_campaign_template_task: not authenticated'; end if;
  select agency_id into v_agency from public.campaign_template where id = p_template_id;
  if v_agency is null then raise exception 'reorder_campaign_template_task: template not found'; end if;
  if not public.is_agency_member(v_agency) then raise exception 'reorder_campaign_template_task: not authorised'; end if;

  update public.campaign_template_task ct
     set sort_order = ord.idx
    from (select id, (ordinality - 1)::int as idx
            from unnest(p_ordered_ids) with ordinality as t(id, ordinality)) ord
   where ct.id = ord.id and ct.template_id = p_template_id;
end; $$;

-- ---------- 6. spawn — the centrepiece ----------
-- Materialise a template into a campaign as real tasks via create_task (identical seeding/notifs).
-- Dates from campaign.start_date + offsets; suggested owner from RACI; copies (no template link).
create or replace function public.spawn_campaign_tasks(p_campaign_id uuid, p_template_id uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid; v_agency uuid; v_camp_start date; v_tmpl_agency uuid;
  v_count int := 0; r record; v_start date; v_due date; v_owner uuid;
begin
  if v_uid is null then raise exception 'spawn_campaign_tasks: not authenticated'; end if;

  select client_id, agency_id, start_date into v_client, v_agency, v_camp_start
    from public.campaign where id = p_campaign_id;
  if v_client is null then raise exception 'spawn_campaign_tasks: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'spawn_campaign_tasks: not authorised'; end if;

  select agency_id into v_tmpl_agency from public.campaign_template where id = p_template_id;
  if v_tmpl_agency is null then raise exception 'spawn_campaign_tasks: template not found'; end if;
  if v_tmpl_agency <> v_agency then raise exception 'spawn_campaign_tasks: template not in the campaign''s agency'; end if;

  -- Idempotency: reject a repeat application of the same template to the same campaign.
  if exists (select 1 from public.campaign_template_spawn s
              where s.campaign_id = p_campaign_id and s.template_id = p_template_id) then
    raise exception 'spawn_campaign_tasks: this template has already been applied to this campaign';
  end if;

  for r in
    select * from public.campaign_template_task where template_id = p_template_id order by sort_order, id
  loop
    -- Dateless campaign → undated tasks (they surface in the timeline's Unscheduled bucket).
    if v_camp_start is not null then
      v_start := case when r.start_offset_days is not null then v_camp_start + r.start_offset_days else null end;
      v_due   := case when r.due_offset_days   is not null then v_camp_start + r.due_offset_days   else null end;
    else
      v_start := null; v_due := null;
    end if;

    v_owner := public._suggested_task_owner(v_agency, v_client, r.task_type);

    -- Route through create_task so 0041 seeding + assignment notifications behave identically.
    perform public.create_task(
      p_client_id       => v_client,
      p_task_type       => r.task_type,
      p_title           => r.title,
      p_owner_id        => v_owner,
      p_estimated_hours => r.estimated_hours,
      p_start_date      => v_start,
      p_due_date        => v_due,
      p_campaign_id     => p_campaign_id
    );
    v_count := v_count + 1;
  end loop;

  insert into public.campaign_template_spawn (campaign_id, template_id, task_count, spawned_by)
  values (p_campaign_id, p_template_id, v_count, v_uid);

  return v_count;
end; $$;

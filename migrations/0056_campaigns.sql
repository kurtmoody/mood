-- Migration 0056 — campaigns (campaign management, slice 1): the entity + grouping.
--
-- A campaign is a named, client-scoped body of work (a launch, a seasonal push) that
-- groups tasks and content_items. Agency-internal in this slice: RLS gates reads to
-- agency members of the campaign's agency — there is DELIBERATELY NO client/portal read
-- path here. The client-facing surface is a later slice on a separate milestone table,
-- so nothing client-visible is coupled to this schema.
--
-- Grouping is a nullable campaign_id FK on task and content_item, ON DELETE SET NULL so
-- deleting a campaign never destroys the work it grouped. The task/content RPCs enforce
-- the integrity rule: a row's campaign must belong to the SAME client as the row.
--
-- create_task / update_task were last changed in 0045 (which carries the 0041 subscriber
-- seeding + the 0043 capacity fields + the 0045 value fields). Adding p_campaign_id changes
-- the signature, so we DROP the exact 0045 signatures first (duplicate-function trap), then
-- recreate the FULL current bodies verbatim + the new param + the client-match rule. Every
-- existing behaviour (auth, agency/client/owner validation, subscriber seeding, notifications,
-- estimated_hours / start_date / value / invoice_status) is preserved. set_post_meta (0042)
-- gets the same treatment for content.

-- ---------- 1. campaign table ----------
create table if not exists public.campaign (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agency(id),
  client_id  uuid not null references public.client(id) on delete cascade,
  name       text not null,
  objective  text check (objective in ('awareness','traffic','leads','conversions','sales')),
  phase      text not null default 'planning'
             check (phase in ('planning','production','live','wrapped','closed')),
  start_date date,
  end_date   date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint campaign_date_order check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists idx_campaign_client_phase on public.campaign (client_id, phase);

-- ---------- 2. campaign_id grouping on task and content_item ----------
alter table public.task
  add column if not exists campaign_id uuid references public.campaign(id) on delete set null;
alter table public.content_item
  add column if not exists campaign_id uuid references public.campaign(id) on delete set null;

create index if not exists idx_task_campaign         on public.task (campaign_id);
create index if not exists idx_content_item_campaign on public.content_item (campaign_id);

-- ---------- 3. RLS: agency members of the campaign's agency only ----------
alter table public.campaign enable row level security;

drop policy if exists campaign_read on public.campaign;
create policy campaign_read on public.campaign
  for select using (public.is_agency_member(agency_id));
-- NO client branch in this slice (see header). Writes go only through the RPCs below.

-- ---------- 4. campaign RPCs (SECURITY DEFINER; authorise in body) ----------
-- create_campaign — agency-for-client; name required; date-order validated.
create or replace function public.create_campaign(
  p_client_id  uuid,
  p_name       text,
  p_objective  text default null,
  p_phase      text default 'planning',
  p_start_date date default null,
  p_end_date   date default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid; v_phase text;
begin
  if v_uid is null then raise exception 'create_campaign: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'create_campaign: not authorised'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'create_campaign: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'create_campaign: invalid objective %', p_objective;
  end if;
  v_phase := coalesce(nullif(btrim(p_phase), ''), 'planning');
  if v_phase not in ('planning','production','live','wrapped','closed') then
    raise exception 'create_campaign: invalid phase %', v_phase;
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'create_campaign: start_date must be on or before end_date';
  end if;

  select c.agency_id into v_agency from public.client c where c.id = p_client_id;

  insert into public.campaign (agency_id, client_id, name, objective, phase, start_date, end_date, created_by)
  values (v_agency, p_client_id, btrim(p_name), p_objective, v_phase, p_start_date, p_end_date, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

-- update_campaign — agency-for-client (via the campaign's client); name required; date-order.
create or replace function public.update_campaign(
  p_id         uuid,
  p_name       text,
  p_objective  text default null,
  p_phase      text default null,
  p_start_date date default null,
  p_end_date   date default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_current_phase text; v_phase text;
begin
  if auth.uid() is null then raise exception 'update_campaign: not authenticated'; end if;
  select client_id, phase into v_client, v_current_phase from public.campaign where id = p_id;
  if v_client is null then raise exception 'update_campaign: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_campaign: not authorised'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'update_campaign: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'update_campaign: invalid objective %', p_objective;
  end if;
  -- Preserve the current phase when none is supplied (0050 update_client_preserve_status
  -- lesson); only a genuinely-supplied value is whitelist-checked.
  v_phase := coalesce(nullif(btrim(p_phase), ''), v_current_phase);
  if nullif(btrim(p_phase), '') is not null and v_phase not in ('planning','production','live','wrapped','closed') then
    raise exception 'update_campaign: invalid phase %', v_phase;
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'update_campaign: start_date must be on or before end_date';
  end if;

  update public.campaign set
    name = btrim(p_name), objective = p_objective, phase = v_phase,
    start_date = p_start_date, end_date = p_end_date, updated_at = now()
  where id = p_id;
end; $$;

-- delete_campaign — agency_admin only, and only a closed campaign (mirrors the archived-only
-- delete_client guard, 0036). Grouped tasks/content survive via campaign_id → set null.
create or replace function public.delete_campaign(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_phase text;
begin
  if v_uid is null then raise exception 'delete_campaign: not authenticated'; end if;
  select agency_id, phase into v_agency, v_phase from public.campaign where id = p_id;
  if v_agency is null then raise exception 'delete_campaign: campaign not found'; end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'delete_campaign: not authorised'; end if;
  if v_phase <> 'closed' then
    raise exception 'delete_campaign: close the campaign before deleting';
  end if;

  delete from public.campaign where id = p_id;
end; $$;

-- ---------- 5. create_task (0045 body + p_campaign_id + client-match rule) ----------
drop function if exists public.create_task(uuid, text, text, uuid, text, text, date, text, text, uuid, numeric, date, numeric, boolean, text);

create function public.create_task(
  p_client_id            uuid default null,
  p_task_type            text default null,
  p_title                text default null,
  p_owner_id             uuid default null,
  p_status               text default 'Not Started',
  p_priority             text default 'Medium',
  p_due_date             date default null,
  p_next_action          text default null,
  p_notes                text default null,
  p_content_item_id      uuid default null,
  p_estimated_hours      numeric default null,
  p_start_date           date default null,
  p_value                numeric default null,
  p_value_client_visible boolean default false,
  p_invoice_status       text default 'not_invoiced',
  p_campaign_id          uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid; v_label text; v_invoice text;
begin
  if v_uid is null then raise exception 'create_task: not authenticated'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'create_task: title required'; end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then
    raise exception 'create_task: estimated_hours must be >= 0';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'create_task: start_date must be on or before due_date';
  end if;
  if p_value is not null and p_value < 0 then raise exception 'create_task: value must be >= 0'; end if;
  v_invoice := coalesce(nullif(btrim(p_invoice_status), ''), 'not_invoiced');
  if v_invoice not in ('not_invoiced','invoiced','paid') then
    raise exception 'create_task: invalid invoice_status %', v_invoice;
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
  -- Campaign must belong to the same client as the task (and to this agency).
  if p_campaign_id is not null then
    if p_client_id is null then raise exception 'create_task: a campaign task must have a client'; end if;
    if not exists (
         select 1 from public.campaign ca
          where ca.id = p_campaign_id and ca.client_id = p_client_id and ca.agency_id = v_agency
       ) then raise exception 'create_task: campaign not in the task''s client'; end if;
  end if;

  insert into public.task (agency_id, client_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, content_item_id, estimated_hours, start_date, value, value_client_visible, invoice_status, campaign_id, created_by)
  values (v_agency, p_client_id, p_task_type, btrim(p_title), p_owner_id,
          coalesce(nullif(btrim(p_status), ''), 'Not Started'),
          coalesce(nullif(btrim(p_priority), ''), 'Medium'),
          p_due_date, p_next_action, p_notes, p_content_item_id, p_estimated_hours, p_start_date,
          p_value, coalesce(p_value_client_visible, false), v_invoice, p_campaign_id, v_uid)
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

-- ---------- 6. update_task (0045 body + p_campaign_id + client-match rule) ----------
drop function if exists public.update_task(uuid, uuid, text, text, uuid, text, text, date, text, text, uuid, numeric, date, numeric, boolean, text);

create function public.update_task(
  p_task_id              uuid,
  p_client_id            uuid default null,
  p_task_type            text default null,
  p_title                text default null,
  p_owner_id             uuid default null,
  p_status               text default null,
  p_priority             text default null,
  p_due_date             date default null,
  p_next_action          text default null,
  p_notes                text default null,
  p_content_item_id      uuid default null,
  p_estimated_hours      numeric default null,
  p_start_date           date default null,
  p_value                numeric default null,
  p_value_client_visible boolean default false,
  p_invoice_status       text default 'not_invoiced',
  p_campaign_id          uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_agency uuid;
  v_old_owner uuid; v_old_status text; v_new_status text; v_label text; v_invoice text;
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
  if p_value is not null and p_value < 0 then raise exception 'update_task: value must be >= 0'; end if;
  v_invoice := coalesce(nullif(btrim(p_invoice_status), ''), 'not_invoiced');
  if v_invoice not in ('not_invoiced','invoiced','paid') then
    raise exception 'update_task: invalid invoice_status %', v_invoice;
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
  -- Campaign must belong to the same client as the task (and to this agency).
  if p_campaign_id is not null then
    if p_client_id is null then raise exception 'update_task: a campaign task must have a client'; end if;
    if not exists (
         select 1 from public.campaign ca
          where ca.id = p_campaign_id and ca.client_id = p_client_id and ca.agency_id = v_agency
       ) then raise exception 'update_task: campaign not in the task''s client'; end if;
  end if;

  v_new_status := coalesce(nullif(btrim(p_status), ''), 'Not Started');

  update public.task set
    client_id = p_client_id, task_type = p_task_type, title = btrim(p_title), owner_id = p_owner_id,
    status = v_new_status,
    priority = coalesce(nullif(btrim(p_priority), ''), 'Medium'),
    due_date = p_due_date, next_action = p_next_action, notes = p_notes,
    content_item_id = p_content_item_id, estimated_hours = p_estimated_hours, start_date = p_start_date,
    value = p_value, value_client_visible = coalesce(p_value_client_visible, false), invoice_status = v_invoice,
    campaign_id = p_campaign_id,
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

-- ---------- 7. set_post_meta (0042 body + p_campaign_id + client-match rule) ----------
-- Signature changes, so drop the exact 0042 signature first (duplicate-function trap).
drop function if exists public.set_post_meta(uuid, uuid, text, text, text, boolean, numeric, date, text);

create function public.set_post_meta(
  p_id            uuid,
  p_designer_id   uuid    default null,
  p_design_status text    default null,
  p_drive_url     text    default null,
  p_high_res_url  text    default null,
  p_boost         boolean default false,
  p_ad_budget     numeric default null,
  p_date_posted   date    default null,
  p_posted_url    text    default null,
  p_campaign_id   uuid    default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'set_post_meta: not authenticated'; end if;

  select ci.client_id, c.agency_id into v_client, v_agency
    from public.content_item ci join public.client c on c.id = ci.client_id
   where ci.id = p_id;
  if v_client is null then raise exception 'set_post_meta: post not found'; end if;
  if not public.is_agency_for_client(v_client) then
    raise exception 'set_post_meta: not authorised';
  end if;

  -- Designer must belong to this post's agency (directory ref; a login is not required).
  if p_designer_id is not null and not exists (
       select 1 from public.team_member tm where tm.id = p_designer_id and tm.agency_id = v_agency
     ) then raise exception 'set_post_meta: designer not in your agency'; end if;

  -- Campaign must belong to the SAME client as the post (and this agency).
  if p_campaign_id is not null and not exists (
       select 1 from public.campaign ca
        where ca.id = p_campaign_id and ca.client_id = v_client and ca.agency_id = v_agency
     ) then raise exception 'set_post_meta: campaign not in the post''s client'; end if;

  update public.content_item set
    designer_id   = p_designer_id,
    design_status = p_design_status,
    drive_url     = p_drive_url,
    high_res_url  = p_high_res_url,
    boost         = coalesce(p_boost, false),
    ad_budget     = p_ad_budget,
    date_posted   = p_date_posted,
    posted_url    = p_posted_url,
    campaign_id   = p_campaign_id,
    updated_at    = now()
  where id = p_id;
end; $$;

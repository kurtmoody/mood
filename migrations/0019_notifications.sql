-- Migration 0019 — notification data layer + emit logic.
--
-- A notification table (recipient-scoped RLS) plus a SECURITY DEFINER emit helper
-- wired into transition_post and add_comment on an attention-based rule. The bell
-- UI and email delivery are later steps. Over/under-notifying is the main risk, so
-- the emit points below are deliberate and minimal.

-- ---------- 1. table ----------
create table if not exists public.notification (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),     -- recipient
  type            text not null,                               -- ready_for_review | approved | changes_requested | comment
  content_item_id uuid references public.content_item(id) on delete cascade,
  actor_id        uuid,                                        -- who caused it
  body            text,
  read_at         timestamptz,                                 -- null = unread
  created_at      timestamptz default now()
);

create index if not exists idx_notification_user_read    on public.notification (user_id, read_at);
create index if not exists idx_notification_content_item on public.notification (content_item_id);

-- ---------- 2. RLS ----------
alter table public.notification enable row level security;

-- Users see only their own.
drop policy if exists notification_select on public.notification;
create policy notification_select on public.notification
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Users may update their own rows — the one allowed direct client write, intended
-- for marking read (setting read_at). Scoped tightly to own rows; it can't leak
-- data (no cross-user visibility) or create rows (no INSERT policy). RLS can't
-- restrict to a single column, so it technically permits editing other columns on
-- one's own rows — harmless. (Alternative: a mark_notification_read RPC + no policy.)
drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No INSERT policy: rows are created only by _notify (SECURITY DEFINER, bypasses RLS).

-- ---------- 3. emit helper (centralises "never notify the actor") ----------
create or replace function public._notify(
  p_user_ids        uuid[],
  p_type            text,
  p_content_item_id uuid,
  p_actor_id        uuid,
  p_body            text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notification (user_id, type, content_item_id, actor_id, body)
  select u, p_type, p_content_item_id, p_actor_id, p_body
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
   where u is distinct from p_actor_id;
end; $$;

-- ---------- 4. recipient resolvers ----------
-- Agency member user_ids for a client (the client's agency, admin/member roles).
create or replace function public._agency_user_ids_for_client(p_client_id uuid)
returns uuid[]
language sql security definer stable set search_path = ''
as $$
  select coalesce(array_agg(m.user_id), '{}'::uuid[])
    from public.client c
    join public.membership m
      on m.scope_type = 'agency' and m.scope_id = c.agency_id
   where c.id = p_client_id
     and m.role in ('agency_admin', 'agency_member');
$$;

-- Logged-in portal users for a client: auth.users matching a portal-enabled
-- client_contact email (lower-cased, as claim_client_access does). Contacts
-- without a login yet aren't returned (email channel handles them later).
create or replace function public._portal_user_ids_for_client(p_client_id uuid)
returns uuid[]
language sql security definer stable set search_path = ''
as $$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
    from public.client_contact cc
    join auth.users u on lower(u.email) = lower(cc.email)
   where cc.client_id = p_client_id
     and cc.portal_access = true;
$$;

-- ---------- 5. transition_post (0017 behaviour preserved; emit added at the end) ----------
create or replace function public.transition_post(
  p_item_id uuid,
  p_action  text,
  p_note    text default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_client    uuid;
  v_status    public.content_status;
  v_version   uuid;
  v_new       public.content_status;
  v_is_agency boolean;
  v_is_client boolean;
  v_title     text;
begin
  if auth.uid() is null then raise exception 'transition_post: not authenticated'; end if;

  select client_id, status, current_version_id, title
    into v_client, v_status, v_version, v_title
    from public.content_item where id = p_item_id;

  if v_client is null then raise exception 'transition_post: post not found'; end if;

  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'client'
       and m.scope_id = v_client
  );

  if v_is_agency then
    null;
  elsif v_is_client then
    if p_action not in ('approve', 'request_changes') or v_status <> 'client_review' then
      raise exception 'transition_post: not authorised';
    end if;
  else
    raise exception 'transition_post: not authorised';
  end if;

  v_new := case
    when v_status = 'draft'             and p_action = 'submit_internal'  then 'internal_review'
    when v_status = 'internal_review'   and p_action = 'approve_internal' then 'client_review'
    when v_status = 'internal_review'   and p_action = 'request_changes'  then 'changes_requested'
    when v_status = 'client_review'     and p_action = 'approve'          then 'approved'
    when v_status = 'client_review'     and p_action = 'request_changes'  then 'changes_requested'
    when v_status = 'changes_requested' and p_action = 'submit_internal'  then 'internal_review'
    when v_status = 'approved'          and p_action = 'schedule'         then 'scheduled'
    when v_status = 'scheduled'         and p_action = 'mark_posted'      then 'posted'
    else null
  end;

  if v_new is null then
    raise exception 'transition_post: action % not allowed from status %', p_action, v_status;
  end if;

  update public.content_item set status = v_new, updated_at = now() where id = p_item_id;

  insert into public.approval_event (content_item_id, version_id, actor_id, action, note)
  values (p_item_id, v_version, auth.uid(), p_action, p_note);

  -- ---- notifications (attention-based; emit on exactly these events) ----
  if v_new = 'client_review' then
    perform public._notify(public._portal_user_ids_for_client(v_client),
      'ready_for_review', p_item_id, auth.uid(),
      coalesce(v_title, 'A post') || ' is ready for review');
  elsif p_action = 'approve' then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'approved', p_item_id, auth.uid(),
      coalesce(v_title, 'A post') || ' was approved');
  elsif p_action = 'request_changes' and v_status = 'client_review' then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'changes_requested', p_item_id, auth.uid(),
      'Changes requested on ' || coalesce(v_title, 'a post') || coalesce(': ' || nullif(btrim(p_note), ''), ''));
  end if;

  return v_new::text;
end; $$;

-- ---------- 6. add_comment (0012 behaviour preserved; emit added at the end) ----------
create or replace function public.add_comment(
  p_item_id uuid,
  p_body    text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client    uuid;
  v_status    public.content_status;
  v_is_agency boolean;
  v_is_client boolean;
  v_id        uuid;
begin
  if auth.uid() is null then raise exception 'add_comment: not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'add_comment: empty comment'; end if;

  select client_id, status into v_client, v_status from public.content_item where id = p_item_id;
  if v_client is null then raise exception 'add_comment: post not found'; end if;

  if v_client not in (select public.client_ids_for_user()) then
    raise exception 'add_comment: not authorised';
  end if;

  insert into public.comment (content_item_id, author_id, body)
  values (p_item_id, auth.uid(), p_body)
  returning id into v_id;

  -- ---- notifications: agency comment on a client-visible post → portal; client comment → agency ----
  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid() and m.scope_type = 'client' and m.scope_id = v_client
  );

  if v_is_agency and v_status in ('client_review','changes_requested','approved','scheduled','posted') then
    perform public._notify(public._portal_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(), 'New comment: ' || left(btrim(p_body), 200));
  elsif v_is_client then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(), 'New comment: ' || left(btrim(p_body), 200));
  end if;

  return v_id;
end; $$;

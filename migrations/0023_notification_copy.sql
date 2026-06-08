-- Migration 0023 — enrich notification copy (client name + post title).
--
-- Copy-only. Recreates transition_post and add_comment with the SAME auth, state
-- machine, emit conditions and recipients as 0019/0021 — the ONLY change is the body
-- strings passed to _notify, now leading with the client name and post title. The bell
-- reads notification.body; the email reuses the same body, so they never drift.
--
-- New formats (British English):
--   ready_for_review  → '<Client> — "<title>": ready for your review'
--   approved          → '<Client> — "<title>": approved by the client'
--   changes_requested → '<Client> — "<title>": changes requested[: <note>]'
--   comment           → '<Client> — "<title>": new comment — <first ~120 chars>'
-- Null title falls back to 'a post'; null client name to 'A client'.

-- ---------- transition_post (0019/0021 behaviour preserved; only bodies enriched) ----------
create or replace function public.transition_post(
  p_item_id uuid,
  p_action  text,
  p_note    text default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_client      uuid;
  v_status      public.content_status;
  v_version     uuid;
  v_new         public.content_status;
  v_is_agency   boolean;
  v_is_client   boolean;
  v_title       text;
  v_client_name text;
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

  -- ---- notifications (same events/recipients as before; bodies enriched) ----
  select name into v_client_name from public.client where id = v_client;

  if v_new = 'client_review' then
    perform public._notify(public._portal_user_ids_for_client(v_client),
      'ready_for_review', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": ready for your review');
  elsif p_action = 'approve' then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'approved', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": approved by the client');
  elsif p_action = 'request_changes' and v_status = 'client_review' then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'changes_requested', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": changes requested'
        || coalesce(': ' || nullif(btrim(p_note), ''), ''));
  end if;

  return v_new::text;
end; $$;

-- ---------- add_comment (0019 behaviour preserved; title fetched + body enriched) ----------
create or replace function public.add_comment(
  p_item_id uuid,
  p_body    text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client      uuid;
  v_status      public.content_status;
  v_is_agency   boolean;
  v_is_client   boolean;
  v_id          uuid;
  v_title       text;
  v_client_name text;
begin
  if auth.uid() is null then raise exception 'add_comment: not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'add_comment: empty comment'; end if;

  select client_id, status, title into v_client, v_status, v_title
    from public.content_item where id = p_item_id;
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

  select name into v_client_name from public.client where id = v_client;

  if v_is_agency and v_status in ('client_review','changes_requested','approved','scheduled','posted') then
    perform public._notify(public._portal_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": new comment — ' || left(btrim(p_body), 120));
  elsif v_is_client then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": new comment — ' || left(btrim(p_body), 120));
  end if;

  return v_id;
end; $$;

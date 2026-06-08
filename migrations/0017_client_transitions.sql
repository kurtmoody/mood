-- Migration 0017 — client-authorised transitions.
--
-- Extends transition_post so a client_approver can approve / request_changes on
-- their OWN client's client_review posts, while the agency keeps every existing
-- power (including approve / request_changes on the client's behalf).
--
-- SECURITY-CRITICAL: this is the first RPC that lets a non-agency user change
-- state. transition_post is SECURITY DEFINER and BYPASSES RLS, so authorisation
-- is enforced here, in the function body — RLS protects nothing inside it.

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
begin
  if auth.uid() is null then raise exception 'transition_post: not authenticated'; end if;

  select client_id, status, current_version_id
    into v_client, v_status, v_version
    from public.content_item where id = p_item_id;

  if v_client is null then raise exception 'transition_post: post not found'; end if;

  -- The caller's relationship to this client (agency takes precedence).
  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'client'
       and m.scope_id = v_client
  );

  -- ---- authorisation ----
  if v_is_agency then
    -- Agency may attempt ANY transition; the state machine below decides validity.
    null;
  elsif v_is_client then
    -- A client may ONLY approve / request_changes, and ONLY from client_review.
    -- Anything else is rejected here (not a silent no-op).
    if p_action not in ('approve', 'request_changes') or v_status <> 'client_review' then
      raise exception 'transition_post: not authorised';
    end if;
  else
    raise exception 'transition_post: not authorised';
  end if;

  -- ---- state machine (unchanged; an action invalid for the status is rejected
  --       regardless of who calls it) ----
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

  -- p_note stays optional — a client request_changes may carry a null/empty note.
  insert into public.approval_event (content_item_id, version_id, actor_id, action, note)
  values (p_item_id, v_version, auth.uid(), p_action, p_note);

  return v_new::text;
end; $$;

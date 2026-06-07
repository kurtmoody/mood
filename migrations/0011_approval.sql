-- Migration 0011 — approval workflow: transition_post RPC, logged to approval_event

create or replace function public.transition_post(
  p_item_id uuid,
  p_action  text,
  p_note    text default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_client  uuid;
  v_status  public.content_status;
  v_version uuid;
  v_new     public.content_status;
begin
  if auth.uid() is null then raise exception 'transition_post: not authenticated'; end if;

  select client_id, status, current_version_id
    into v_client, v_status, v_version
    from public.content_item where id = p_item_id;

  if v_client is null then raise exception 'transition_post: post not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'transition_post: not authorised'; end if;

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

  return v_new::text;
end; $$;

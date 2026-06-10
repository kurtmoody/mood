-- Migration 0038 — drag-to-reschedule a post on the calendar.
--
-- A dedicated, lightweight write path: it ONLY moves scheduled_at (and, optionally,
-- marks an already-approved/scheduled post as posted). It deliberately does NOT reuse
-- update_post, which forks a new version + bounces frozen posts to internal_review —
-- wrong for a pure date move. Agency-only; no client write path.

create or replace function public.reschedule_content_item(
  p_id uuid,
  p_scheduled_at timestamptz,
  p_mark_posted boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
  v_status public.content_status;
begin
  if auth.uid() is null then raise exception 'reschedule_content_item: not authenticated'; end if;

  select client_id, status into v_client, v_status
    from public.content_item where id = p_id;
  if v_client is null then raise exception 'reschedule_content_item: post not found'; end if;

  -- Agency members of the post's client's agency only — clients cannot reschedule.
  if not public.is_agency_for_client(v_client) then
    raise exception 'reschedule_content_item: not authorised';
  end if;

  -- Always move the date. Mark posted ONLY when asked AND the post is in a state from
  -- which "posted" is legitimate (approved/scheduled) — never let a draft/review post
  -- jump to posted. For any other status the flag is ignored.
  update public.content_item
     set scheduled_at = p_scheduled_at,
         status = case
                    when p_mark_posted and status in ('approved','scheduled')
                      then 'posted'::public.content_status
                    else status
                  end,
         updated_at = now()
   where id = p_id;
end; $$;

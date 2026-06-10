-- Migration 0040 — lightweight client status setter (archive / reactivate).
--
-- update_client is the heavy full-form update; archiving from a list row should not have
-- to resend every field. This is a minimal, agency-authorised status-only setter that
-- validates the value against the same allowed set as the client_status_check constraint.
-- Reversible action → agency members (admin OR member), not admin-only.

create or replace function public.set_client_status(p_client_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'set_client_status: not authenticated'; end if;
  if p_status not in ('prospect','active','paused','archived') then
    raise exception 'set_client_status: invalid status %', p_status;
  end if;

  select agency_id into v_agency from public.client where id = p_client_id;
  if v_agency is null then raise exception 'set_client_status: client not found'; end if;

  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role in ('agency_admin','agency_member')
  ) then raise exception 'set_client_status: not authorised'; end if;

  update public.client set status = p_status where id = p_client_id;
end; $$;

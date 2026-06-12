-- Migration 0049 — extend a pending invite's expiry (admin-only).
--
-- Invites expire 7 days after creation (0035) with no way to renew: an admin had to
-- revoke + recreate. extend_invite resets the window to now()+7 days on a PENDING
-- invite only — accepted/revoked/expired-status rows are untouched. Same authorisation
-- as revoke_invite: agency_admin of the agency that owns the invite's scope.

create or replace function public.extend_invite(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_scope_type text; v_scope_id uuid; v_agency uuid;
begin
  if v_uid is null then raise exception 'extend_invite: not authenticated'; end if;

  select scope_type, scope_id into v_scope_type, v_scope_id
    from public.invite where id = p_id;
  if v_scope_type is null then raise exception 'extend_invite: invite not found'; end if;

  if v_scope_type = 'agency' then
    v_agency := v_scope_id;
  else
    select c.agency_id into v_agency from public.client c where c.id = v_scope_id;
  end if;

  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'extend_invite: not authorised'; end if;

  update public.invite set expires_at = now() + interval '7 days'
   where id = p_id and status = 'pending';
end; $$;

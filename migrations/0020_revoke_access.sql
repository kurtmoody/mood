-- Migration 0020 — make "Revoke access" actually revoke.
--
-- set_contact_portal_access(..., false) previously only flipped
-- client_contact.portal_access. Access is enforced by the membership table, so an
-- already-logged-in contact kept their client-scope membership and retained access
-- indefinitely. On revoke we now also delete that membership.
--
-- SECURITY-CRITICAL: the delete is scoped to THIS client's client-scope membership
-- for the user(s) whose email matches the contact — agency memberships and other
-- clients' memberships are never touched.

create or replace function public.set_contact_portal_access(
  p_contact_id uuid,
  p_enabled    boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_client uuid;
  v_email  text;
begin
  if auth.uid() is null then raise exception 'set_contact_portal_access: not authenticated'; end if;
  select client_id, email into v_client, v_email from public.client_contact where id = p_contact_id;
  if v_client is null then raise exception 'set_contact_portal_access: contact not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'set_contact_portal_access: not authorised'; end if;

  update public.client_contact set portal_access = p_enabled where id = p_contact_id;

  -- Revoking: strip the user's client-scope membership for THIS client so they lose
  -- access immediately (the flag alone doesn't — access is enforced by membership).
  -- Granting (p_enabled = true) is unchanged: the membership is created on next login
  -- by claim_client_access. Edge cases: no auth account → 0 rows; multiple contacts
  -- sharing the email → a remaining portal_access=true contact re-grants on next login.
  if p_enabled = false then
    delete from public.membership m
     where m.scope_type = 'client'
       and m.scope_id   = v_client
       and m.user_id in (
         select u.id from auth.users u where lower(u.email) = lower(v_email)
       );
  end if;
end; $$;

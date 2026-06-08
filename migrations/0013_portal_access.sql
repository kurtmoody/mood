-- Migration 0013 — client portal: access flag + agency toggle + login claim

alter table public.client_contact
  add column if not exists portal_access boolean not null default false;

-- Agency toggles a contact's portal access (agency-gated via the contact's client)
create or replace function public.set_contact_portal_access(
  p_contact_id uuid,
  p_enabled    boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid;
begin
  if auth.uid() is null then raise exception 'set_contact_portal_access: not authenticated'; end if;
  select client_id into v_client from public.client_contact where id = p_contact_id;
  if v_client is null then raise exception 'set_contact_portal_access: contact not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'set_contact_portal_access: not authorised'; end if;
  update public.client_contact set portal_access = p_enabled where id = p_contact_id;
end; $$;

-- On login, a client claims access: matches their email to portal-enabled contacts
-- and grants a client-scoped membership (client_approver) for each matching client.
create or replace function public.claim_client_access()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'claim_client_access: not authenticated'; end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  insert into public.membership (user_id, scope_type, scope_id, role)
  select auth.uid(), 'client', cc.client_id, 'client_approver'
    from public.client_contact cc
   where cc.portal_access = true
     and lower(cc.email) = v_email
     and not exists (
       select 1 from public.membership m
        where m.user_id = auth.uid()
          and m.scope_type = 'client'
          and m.scope_id = cc.client_id
     );
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

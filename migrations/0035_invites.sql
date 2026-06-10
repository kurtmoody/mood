-- Migration 0035 — invite flow (agency + client), Supabase-native magic-link.
--
-- The invite is the server-side record of intent. We do NOT mint a custom token: the
-- invitee signs in with the normal magic link for their invited email, and
-- accept_pending_invites() (run on every login) grants exactly what a pending invite
-- backs — nothing more. accept reads the caller's email from auth.users via auth.uid(),
-- NEVER from a parameter, so a user can only accept invites addressed to their own email.
--
-- Emails are stored lower-cased (no citext dependency); all matching is case-insensitive.

create table if not exists public.invite (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  scope_type  text not null check (scope_type in ('agency','client')),
  scope_id    uuid not null,
  role        text not null,
  status      text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

-- One live invite per email+scope (prevents duplicate pending invites at the DB floor).
create unique index if not exists invite_one_pending
  on public.invite (email, scope_type, scope_id) where status = 'pending';

create index if not exists invite_email_pending
  on public.invite (email) where status = 'pending';

alter table public.invite enable row level security;

-- Read: an agency_admin sees invites whose scope resolves to THEIR agency
-- (agency scope → scope_id is the agency; client scope → the client is theirs).
-- No write policies: create/revoke go through the SECURITY DEFINER RPCs below.
drop policy if exists invite_read on public.invite;
create policy invite_read on public.invite
  for select using (
    exists (
      select 1 from public.membership m
       where m.user_id = auth.uid()
         and m.scope_type = 'agency'
         and m.role = 'agency_admin'
         and m.scope_id = case
           when public.invite.scope_type = 'agency' then public.invite.scope_id
           else (select c.agency_id from public.client c where c.id = public.invite.scope_id)
         end
    )
  );

-- ---------- write: create an invite (admin-only, agency-scoped) ----------
create or replace function public.create_invite(
  p_email text, p_scope_type text, p_scope_id uuid, p_role text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(btrim(p_email));
  v_agency uuid;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'create_invite: not authenticated'; end if;
  if v_email is null or v_email = '' then raise exception 'create_invite: email is required'; end if;

  -- scope_type / role combos that are sane for now.
  if p_scope_type = 'agency' then
    if p_role <> 'agency_member' then raise exception 'create_invite: agency scope takes agency_member only'; end if;
  elsif p_scope_type = 'client' then
    if p_role not in ('client_approver','client_viewer') then
      raise exception 'create_invite: client scope takes client_approver or client_viewer';
    end if;
  else
    raise exception 'create_invite: invalid scope_type %', p_scope_type;
  end if;

  -- Resolve the agency that owns the scope, then require the caller to be ITS admin.
  -- For a client scope owned by another agency this yields that other agency, so the
  -- admin check below fails — the cross-tenant guard.
  if p_scope_type = 'agency' then
    v_agency := p_scope_id;
  else
    select c.agency_id into v_agency from public.client c where c.id = p_scope_id;
    if v_agency is null then raise exception 'create_invite: client not found'; end if;
  end if;

  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'create_invite: not authorised'; end if;

  -- No duplicate pending invite for this email+scope.
  if exists (
    select 1 from public.invite i
     where i.email = v_email and i.scope_type = p_scope_type
       and i.scope_id = p_scope_id and i.status = 'pending'
  ) then raise exception 'create_invite: a pending invite already exists for this email'; end if;

  insert into public.invite (email, scope_type, scope_id, role, invited_by)
  values (v_email, p_scope_type, p_scope_id, p_role, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- write: revoke an invite (admin-only) ----------
create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_scope_type text; v_scope_id uuid; v_agency uuid;
begin
  if v_uid is null then raise exception 'revoke_invite: not authenticated'; end if;

  select scope_type, scope_id into v_scope_type, v_scope_id
    from public.invite where id = p_id;
  if v_scope_type is null then raise exception 'revoke_invite: invite not found'; end if;

  if v_scope_type = 'agency' then
    v_agency := v_scope_id;
  else
    select c.agency_id into v_agency from public.client c where c.id = v_scope_id;
  end if;

  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'revoke_invite: not authorised'; end if;

  update public.invite set status = 'revoked' where id = p_id and status = 'pending';
end; $$;

-- ---------- accept: grant memberships backed by pending invites for THIS user ----------
-- Idempotent; safe on every login. Reads the caller's email from auth.users (never a
-- parameter). Grants ONLY what a live pending invite backs — scope_type/scope_id/role
-- come straight from the invite row, so a client invite can never yield agency access.
create or replace function public.accept_pending_invites()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_count int := 0;
  r record;
begin
  if auth.uid() is null then raise exception 'accept_pending_invites: not authenticated'; end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  for r in
    select id, scope_type, scope_id, role
      from public.invite
     where lower(email) = v_email
       and status = 'pending'
       and expires_at > now()
  loop
    -- Grant the membership exactly as the invite specifies.
    insert into public.membership (user_id, scope_type, scope_id, role)
    values (auth.uid(), r.scope_type, r.scope_id, r.role::public.member_role)
    on conflict (user_id, scope_type, scope_id) do nothing;

    -- Link the directory row (by email) so assignment/mentions resolve to this user.
    if r.scope_type = 'agency' then
      update public.team_member
         set user_id = auth.uid()
       where agency_id = r.scope_id and lower(email) = v_email and user_id is null;
    else
      update public.client_contact
         set user_id = auth.uid()
       where client_id = r.scope_id and lower(email) = v_email and user_id is null;
    end if;

    update public.invite set status = 'accepted', accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end; $$;

-- Migration 0033 — permission management: promote/demote agency users between
-- agency_admin and agency_member, with a last-admin lockout guard.
--
-- membership is own-rows-only under RLS (membership_self), so listing OTHER users'
-- roles needs a SECURITY DEFINER read helper too. Both functions are agency_admin-only.

-- ---------- read: list an agency's members (admin-only) ----------
create or replace function public.list_agency_members(p_agency_id uuid)
returns table (user_id uuid, role text, full_name text, email text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'list_agency_members: not authenticated'; end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = auth.uid() and m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin'
  ) then raise exception 'list_agency_members: not authorised'; end if;

  return query
    select m.user_id,
           m.role::text,
           coalesce(tm.full_name, u.email, m.user_id::text)::text as full_name,
           u.email::text
      from public.membership m
      left join public.team_member tm on tm.user_id = m.user_id and tm.agency_id = p_agency_id
      left join auth.users u on u.id = m.user_id
     where m.scope_type = 'agency' and m.scope_id = p_agency_id
       and m.role in ('agency_admin', 'agency_member')
     order by coalesce(tm.full_name, u.email::text);
end; $$;

-- ---------- write: change a member's role (admin-only, last-admin guarded) ----------
create or replace function public.set_member_role(p_target_user_id uuid, p_agency_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_admin_count int;
begin
  if v_uid is null then raise exception 'set_member_role: not authenticated'; end if;

  -- Caller must be agency_admin of this agency.
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin'
  ) then raise exception 'set_member_role: not authorised'; end if;

  -- Only these two roles are settable here.
  if p_role not in ('agency_admin', 'agency_member') then
    raise exception 'set_member_role: invalid role %', p_role;
  end if;

  -- Target must already have an agency membership here — this changes access, not grants it.
  if not exists (
    select 1 from public.membership m
     where m.user_id = p_target_user_id and m.scope_type = 'agency' and m.scope_id = p_agency_id
  ) then raise exception 'set_member_role: target has no membership for this agency'; end if;

  -- Lockout guard: never demote the last remaining admin to member.
  if p_role = 'agency_member' and exists (
    select 1 from public.membership m
     where m.user_id = p_target_user_id and m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin'
  ) then
    select count(*) into v_admin_count
      from public.membership m
     where m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin';
    if v_admin_count <= 1 then
      raise exception 'set_member_role: cannot demote the last admin';
    end if;
  end if;

  -- membership.role is the enum public.member_role; cast the (already-validated) text.
  update public.membership set role = p_role::public.member_role
   where user_id = p_target_user_id and scope_type = 'agency' and scope_id = p_agency_id;
end; $$;

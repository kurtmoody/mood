-- Migration 0034 — edit + deactivate team members (completes the team CRUD).
-- Add-only until now (0005). No hard delete: "delete" is soft (is_active=false),
-- reactivate by editing or via the toggle. Auth mirrors add_team_member (0005):
-- the caller must hold an agency_admin/agency_member membership for the member's
-- own agency. Authorisation lives INSIDE the RPC (SECURITY DEFINER bypasses RLS).

-- ---------- write: edit a member (name/role/email/active) ----------
create or replace function public.update_team_member(
  p_id uuid, p_full_name text, p_role text, p_email text, p_is_active boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'update_team_member: not authenticated'; end if;

  -- full_name is required.
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'update_team_member: full name is required';
  end if;

  -- The member must exist; capture its agency.
  select agency_id into v_agency from public.team_member where id = p_id;
  if v_agency is null then raise exception 'update_team_member: member not found'; end if;

  -- Caller must be an agency_admin/agency_member of THAT agency.
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role in ('agency_admin','agency_member')
  ) then raise exception 'update_team_member: not authorised'; end if;

  update public.team_member
     set full_name = btrim(p_full_name),
         role      = p_role,
         email     = p_email,
         is_active = coalesce(p_is_active, is_active)
   where id = p_id;
end; $$;

-- ---------- write: quick deactivate/reactivate toggle ----------
create or replace function public.set_team_member_active(
  p_id uuid, p_is_active boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'set_team_member_active: not authenticated'; end if;
  if p_is_active is null then raise exception 'set_team_member_active: active flag required'; end if;

  select agency_id into v_agency from public.team_member where id = p_id;
  if v_agency is null then raise exception 'set_team_member_active: member not found'; end if;

  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role in ('agency_admin','agency_member')
  ) then raise exception 'set_team_member_active: not authorised'; end if;

  update public.team_member set is_active = p_is_active where id = p_id;
end; $$;

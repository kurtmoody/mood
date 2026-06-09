-- Migration 0032 — admin write path for the RACI matrix.
--
-- raci_matrix exists (0027) with agency-scoped read RLS and no write policies. This adds
-- an ADMIN-LEVEL write RPC: set_raci_matrix does a transactional replace-all of an
-- agency's grid. Authorised to agency_admin of that agency specifically (not any
-- member). No table or RLS change.

create or replace function public.set_raci_matrix(p_agency_id uuid, p_cells jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'set_raci_matrix: not authenticated'; end if;

  -- Admin-level config: must be agency_admin of THIS agency (not merely a member).
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid
       and m.scope_type = 'agency'
       and m.scope_id = p_agency_id
       and m.role = 'agency_admin'
  ) then raise exception 'set_raci_matrix: not authorised'; end if;

  -- Every assigned person must belong to this agency.
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
      as c(task_type text, team_member_id uuid, raci_value text)
     where c.team_member_id is not null
       and not exists (select 1 from public.team_member t where t.id = c.team_member_id and t.agency_id = p_agency_id)
  ) then raise exception 'set_raci_matrix: team member not in your agency'; end if;

  -- Transactional replace-all (one function body = one transaction).
  delete from public.raci_matrix where agency_id = p_agency_id;

  insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value)
  select p_agency_id, btrim(c.task_type), c.team_member_id, btrim(c.raci_value)
    from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
      as c(task_type text, team_member_id uuid, raci_value text)
   where c.team_member_id is not null
     and coalesce(btrim(c.task_type), '') <> ''
     and coalesce(btrim(c.raci_value), '') <> '';   -- skip "—" (no assignment)
end; $$;

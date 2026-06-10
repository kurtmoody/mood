-- Migration 0036 — permanent (hard) delete for team members and clients.
--
-- Highest-stakes destructive ops. Both are admin-only, SECURITY DEFINER, search_path='',
-- and TWO-STEP: a row must already be deactivated/archived (the reversible soft state)
-- before it can be permanently removed. Each runs in a single transaction (one function
-- body = one transaction), so a mid-way failure rolls the whole thing back.

-- ============================================================================
-- delete_team_member — reassign-then-delete.
--
-- team_member is referenced by: task.owner_id (NO ACTION → would BLOCK a raw delete),
-- raci_matrix.team_member_id (CASCADE — would lose cells), client_ownership's 8 slots
-- and client_internal.account_owner_id (SET NULL — would silently blank). We reassign
-- all of these to a successor first, then delete, so nothing is lost or orphaned.
-- ============================================================================
create or replace function public.delete_team_member(p_id uuid, p_successor_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_agency uuid;
  v_active boolean;
  v_user   uuid;
begin
  if v_uid is null then raise exception 'delete_team_member: not authenticated'; end if;

  select agency_id, is_active, user_id into v_agency, v_active, v_user
    from public.team_member where id = p_id;
  if v_agency is null then raise exception 'delete_team_member: member not found'; end if;

  -- Caller must be agency_admin of THIS member's agency.
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'delete_team_member: not authorised'; end if;

  -- Two-step: must be soft-deactivated first.
  if v_active then raise exception 'delete_team_member: deactivate the member before deleting'; end if;

  -- Never delete a directory row out from under a live login.
  if v_user is not null then
    raise exception 'delete_team_member: member has a linked login — revoke their access first';
  end if;

  -- Successor must be a different, real member of the same agency.
  if p_successor_id is null then raise exception 'delete_team_member: a successor is required'; end if;
  if p_successor_id = p_id then raise exception 'delete_team_member: successor must differ from the member'; end if;
  if not exists (
    select 1 from public.team_member t where t.id = p_successor_id and t.agency_id = v_agency
  ) then raise exception 'delete_team_member: successor must be a member of the same agency'; end if;

  -- Reassign tasks (the FK that would otherwise block).
  update public.task set owner_id = p_successor_id where owner_id = p_id;

  -- Reassign account ownership (SET NULL FK; reassign so accounts keep an owner).
  update public.client_internal set account_owner_id = p_successor_id where account_owner_id = p_id;

  -- Reassign the 8 client_ownership slots (per-column; no cross-column uniqueness).
  update public.client_ownership set lead_pm_id        = p_successor_id where lead_pm_id        = p_id;
  update public.client_ownership set comms_backup_id   = p_successor_id where comms_backup_id   = p_id;
  update public.client_ownership set creative_lead_id  = p_successor_id where creative_lead_id  = p_id;
  update public.client_ownership set design_owner_id   = p_successor_id where design_owner_id   = p_id;
  update public.client_ownership set content_owner_id  = p_successor_id where content_owner_id  = p_id;
  update public.client_ownership set video_owner_id    = p_successor_id where video_owner_id    = p_id;
  update public.client_ownership set sales_ops_id      = p_successor_id where sales_ops_id      = p_id;
  update public.client_ownership set intern_support_id = p_successor_id where intern_support_id = p_id;

  -- RACI: MERGE. uq_raci_cell (agency_id, task_type, team_member_id) means a plain
  -- update would collide on cells the successor already holds — drop those duplicates
  -- first, then move the rest across.
  delete from public.raci_matrix r
   where r.team_member_id = p_id
     and exists (
       select 1 from public.raci_matrix s
        where s.agency_id = r.agency_id and s.task_type = r.task_type
          and s.team_member_id = p_successor_id
     );
  update public.raci_matrix set team_member_id = p_successor_id where team_member_id = p_id;

  delete from public.team_member where id = p_id;
end; $$;

-- ============================================================================
-- delete_client — guarded cascade.
--
-- Most children cascade from client (channel, content_item → version/comment/
-- approval_event/media/notification/post_asset_link, client_contact, client_internal,
-- brand_asset, client_ownership). Three do NOT and are removed explicitly:
--   - task.client_id is ON DELETE SET NULL (tasks would orphan)
--   - membership / invite use a plain scope_id (no FK)
-- NOTE: storage objects in the private content-media bucket are NOT removed here — this
-- is a DB-only delete. Purge storage separately if required.
-- ============================================================================
create or replace function public.delete_client(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_agency uuid;
  v_status text;
begin
  if v_uid is null then raise exception 'delete_client: not authenticated'; end if;

  select agency_id, status into v_agency, v_status from public.client where id = p_id;
  if v_agency is null then raise exception 'delete_client: client not found'; end if;

  -- Caller must be agency_admin of THIS client's agency.
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency'
       and m.scope_id = v_agency and m.role = 'agency_admin'
  ) then raise exception 'delete_client: not authorised'; end if;

  -- Two-step: only an archived client can be permanently deleted.
  if v_status <> 'archived' then
    raise exception 'delete_client: archive the client before deleting';
  end if;

  -- The non-cascading children.
  delete from public.task       where client_id = p_id;
  delete from public.membership where scope_type = 'client' and scope_id = p_id;
  delete from public.invite     where scope_type = 'client' and scope_id = p_id;

  -- The rest cascades from here.
  delete from public.client where id = p_id;
end; $$;

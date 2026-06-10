-- Migration 0042 — production-metadata fields on content_item (content grid, sub-slice 1).
--
-- Adds the genuinely-missing Monday columns as plain columns on content_item, plus a
-- LIGHTWEIGHT setter. These are production metadata (Drive links, design sub-status, boost
-- /budget, posted date + proof link, designer) — editing them must NOT fork a version or
-- bounce the post to re-review the way update_post does for content. So they get their own
-- setter, like reschedule_content_item (0038), instead of going through update_post.
--
-- Reused existing fields (no column added): title, client, scheduled_at, channel (Platform),
-- caption (content_version.body), status (Overall Status), Posted (= status 'posted'),
-- PM (= client_ownership.lead_pm_id, derived per client). Designer is a NEW directory ref
-- (designer_id → team_member) so directory-only team members without a login can be assigned;
-- content_item.assigned_to is left untouched.

alter table public.content_item add column if not exists designer_id   uuid references public.team_member(id) on delete set null;
alter table public.content_item add column if not exists design_status text;
alter table public.content_item add column if not exists drive_url     text;
alter table public.content_item add column if not exists high_res_url  text;
alter table public.content_item add column if not exists boost         boolean not null default false;
alter table public.content_item add column if not exists ad_budget     numeric;
alter table public.content_item add column if not exists date_posted   date;
alter table public.content_item add column if not exists posted_url    text;

-- ---------- set_post_meta — production metadata only, no version fork ----------
-- Agency-for-client only (no client write path). Writes the metadata columns + designer_id.
-- Does not touch title/channel/scheduled_at/status/body, so it never forks a version or
-- changes the approval state. The designer must be a team member of the post's agency.
create or replace function public.set_post_meta(
  p_id            uuid,
  p_designer_id   uuid    default null,
  p_design_status text    default null,
  p_drive_url     text    default null,
  p_high_res_url  text    default null,
  p_boost         boolean default false,
  p_ad_budget     numeric default null,
  p_date_posted   date    default null,
  p_posted_url    text    default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_agency uuid;
begin
  if auth.uid() is null then raise exception 'set_post_meta: not authenticated'; end if;

  select ci.client_id, c.agency_id into v_client, v_agency
    from public.content_item ci join public.client c on c.id = ci.client_id
   where ci.id = p_id;
  if v_client is null then raise exception 'set_post_meta: post not found'; end if;
  if not public.is_agency_for_client(v_client) then
    raise exception 'set_post_meta: not authorised';
  end if;

  -- Designer must belong to this post's agency (directory ref; a login is not required).
  if p_designer_id is not null and not exists (
       select 1 from public.team_member tm where tm.id = p_designer_id and tm.agency_id = v_agency
     ) then raise exception 'set_post_meta: designer not in your agency'; end if;

  update public.content_item set
    designer_id   = p_designer_id,
    design_status = p_design_status,
    drive_url     = p_drive_url,
    high_res_url  = p_high_res_url,
    boost         = coalesce(p_boost, false),
    ad_budget     = p_ad_budget,
    date_posted   = p_date_posted,
    posted_url    = p_posted_url,
    updated_at    = now()
  where id = p_id;
end; $$;

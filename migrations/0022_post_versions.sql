-- Migration 0022 — role-filtered version history.
--
-- get_post_versions(p_item_id) returns the post's versions, filtered by the caller's
-- relationship to the client. It is SECURITY DEFINER (bypasses RLS), so ALL
-- authorisation lives in the body — deliberately, so we don't have to widen the base
-- content_version / media / approval_event SELECT policies (which gate by the post's
-- CURRENT status and therefore can't express per-version "was this sent to the client").
--
--   Agency (is_agency_for_client): ALL versions.
--   Client (client-member, not agency): ONLY versions that were sent to them — i.e. a
--     version v such that EXISTS an approval_event with version_id = v.id AND
--     action = 'approve_internal'. A purely-internal draft version (no such event) is
--     never returned. internal_note is nulled for clients (never client-facing).
--   Neither: raise.
--
-- Media is returned as storage_paths (not signed URLs); the app signs them.

create or replace function public.get_post_versions(p_item_id uuid)
returns table (
  version_id    uuid,
  version_no    int,
  body          text,
  internal_note text,
  created_by    uuid,
  created_at    timestamptz,
  is_current    boolean,
  events        jsonb,
  media         jsonb
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_client    uuid;
  v_current   uuid;
  v_is_agency boolean;
  v_is_client boolean;
begin
  if auth.uid() is null then raise exception 'get_post_versions: not authenticated'; end if;

  select ci.client_id, ci.current_version_id
    into v_client, v_current
    from public.content_item ci where ci.id = p_item_id;
  if v_client is null then raise exception 'get_post_versions: post not found'; end if;

  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'client'
       and m.scope_id = v_client
  );

  if not v_is_agency and not v_is_client then
    raise exception 'get_post_versions: not authorised';
  end if;

  return query
  select
    cv.id,
    cv.version_no,
    cv.body,
    case when v_is_agency then cv.internal_note else null end,   -- internal_note: agency only
    cv.created_by,
    cv.created_at,
    (cv.id = v_current) as is_current,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'version_id', ae.version_id,
               'action',     ae.action,
               'created_at', ae.created_at,
               'actor_id',   ae.actor_id
             ) order by ae.created_at)
        from public.approval_event ae
       where ae.version_id = cv.id
    ), '[]'::jsonb) as events,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           md.id,
               'storage_path', md.storage_path,
               'mime_type',    md.mime_type
             ) order by md.created_at)
        from public.media md
       where md.version_id = cv.id
    ), '[]'::jsonb) as media
  from public.content_version cv
  where cv.content_item_id = p_item_id
    and (
      v_is_agency
      -- Client: ONLY versions sent to the client (this exact version reached client_review).
      or exists (
        select 1 from public.approval_event ae2
         where ae2.version_id = cv.id
           and ae2.action = 'approve_internal'
      )
    )
  order by cv.version_no desc;
end; $$;

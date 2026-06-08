-- Migration 0016 — close the direct-write side-door on the content tables.
--
-- Writes to the content tables are now EXCLUSIVELY via SECURITY DEFINER RPCs
-- (create_post, update_post, transition_post, add_comment, delete_comment,
-- add_channel, delete_channel). Those run as the function owner and bypass RLS,
-- so removing the permissive write policies below changes nothing for the app
-- (which does zero direct writes) — it only removes the ability to write these
-- tables directly through the PostgREST API.
--
-- DO NOT add INSERT/UPDATE/DELETE/ALL policies to these tables. With none present,
-- neither agency nor client users have a direct write path; all writes go via RPC.

-- The two pre-existing permissive write policies (from the initial schema):
--   content_item.ci_write     — FOR ALL  to authenticated, using/with check is_agency_for_client(client_id)
--   comment.comment_insert    — FOR INSERT to authenticated
drop policy if exists ci_write on public.content_item;
drop policy if exists comment_insert on public.comment;

-- The other three content tables carry ONLY SELECT policies (the *_select policies
-- from migration 0015) — there are no INSERT/UPDATE/DELETE/ALL policies to remove:
--   content_version  → content_version_select  (SELECT only)
--   approval_event   → approval_event_select   (SELECT only)
--   channel          → channel_select          (SELECT only)
-- Verified against schema.sql + 0015_content_rls.sql. If a future pg_policies dump
-- shows any non-SELECT policy on these, drop it here too.

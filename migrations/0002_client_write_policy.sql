-- ============================================================
-- Migration 0002 — client write policy (agency-only)
-- The client table had a read policy (client_read) but NO write policy,
-- so agency users could not insert/update/delete clients. Add one.
-- Idempotent. Reference + run in Supabase SQL Editor; do NOT run here,
-- and do NOT edit schema.sql.
--
-- using:      is_agency_for_client(id) gates update/delete of existing rows.
-- with check: validates inserts (and updated rows) — is_agency_for_client
--             can't help on insert because the row doesn't exist yet, so we
--             check the new agency_id against the user's agency memberships.
-- ============================================================

drop policy if exists client_write on public.client;
create policy client_write on public.client
  for all to authenticated
  using (public.is_agency_for_client(id))
  with check (
    agency_id in (
      select scope_id from public.membership
       where user_id = auth.uid()
         and scope_type = 'agency'
         and role in ('agency_admin','agency_member')
    )
  );

-- Migration 0048 — close the client_internal write side-door + constrain RACI values.
--
-- client_internal_write (0001) was the last permissive write policy left on an
-- agency-internal table — it predates the 0016 "all writes via SECURITY DEFINER RPCs"
-- hardening, and let any agency member write billing/retainer data directly via
-- PostgREST, outside the RPC choke point. Both legitimate write paths (create_client
-- 0004, update_client 0006) are SECURITY DEFINER and bypass RLS, so dropping the
-- policy removes the side-door without changing app behaviour. The read policy stays.
--
-- Also: raci_matrix.raci_value had no CHECK constraint — only the RACI editor's
-- dropdown limited it. Constrain it to the legal set ('' / "—" rows are never stored;
-- set_raci skips them).

drop policy if exists client_internal_write on public.client_internal;

alter table public.raci_matrix drop constraint if exists raci_value_allowed;
alter table public.raci_matrix add constraint raci_value_allowed
  check (raci_value in ('A', 'R', 'S', 'C', 'I', 'A/R'));

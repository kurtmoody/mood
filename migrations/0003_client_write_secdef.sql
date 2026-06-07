-- ============================================================
-- Migration 0003 — fix client insert check via SECURITY DEFINER helper
-- 0002's client_write WITH CHECK used an inline subquery on membership,
-- evaluated under membership's RLS during the check, so it returned empty.
-- Replace with a SECURITY DEFINER helper, consistent with
-- is_agency_for_client / client_ids_for_user. Idempotent.
-- ============================================================

create or replace function public.can_admin_agency(a uuid)
returns boolean
language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'agency'
       and m.scope_id = a
       and m.role in ('agency_admin','agency_member')
  );
$$;

drop policy if exists client_write on public.client;
create policy client_write on public.client
  for all to authenticated
  using (public.is_agency_for_client(id))
  with check (public.can_admin_agency(agency_id));

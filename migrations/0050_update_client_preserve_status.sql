-- Migration 0050 — update_client preserves status / timezone / currency when omitted.
--
-- Repo record of a fix hand-applied to live in the Supabase SQL editor. Root-causes the
-- update_client status-revert: p_status/p_timezone/p_currency previously defaulted to
-- 'active'/'Europe/Malta'/'EUR', so any caller that didn't resend them (the edit form)
-- silently reset the stored value — saving an unrelated field reverted an 'archived'
-- client to 'active'. They now default to null and each write coalesces to the existing
-- value, so an omitted field is preserved. Same signature, same auth check, otherwise the
-- 0025 body verbatim (create or replace matches the existing signature in place).
--
-- currency: the client_internal VALUES passes p_currency raw (not coalesced to 'EUR') so
-- excluded.currency is null when omitted and the on-conflict coalesce preserves the row's
-- existing currency. In practice the client_internal row always pre-exists (create_client
-- makes it), so the insert branch — and its lost 'EUR' default — is never the live path.

create or replace function public.update_client(
  p_client_id uuid,
  p_name text,
  p_status text default null,
  p_website text default null,
  p_industry text default null,
  p_timezone text default null,
  p_brand_colour text default null,
  p_calendar_colour text default null,
  p_account_owner_id uuid default null,
  p_notes text default null,
  p_billing_email text default null,
  p_vat_number text default null,
  p_billing_address text default null,
  p_payment_terms text default null,
  p_currency text default null,
  p_retainer_amount numeric default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid;
begin
  if v_uid is null then raise exception 'update_client: not authenticated'; end if;
  select c.agency_id into v_agency from public.client c where c.id = p_client_id;
  if v_agency is null then raise exception 'update_client: client not found'; end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type='agency' and m.scope_id = v_agency
       and m.role in ('agency_admin','agency_member')
  ) then raise exception 'update_client: not authorised'; end if;

  update public.client set
    name = p_name, status = coalesce(p_status, status), website = p_website,
    industry = p_industry, timezone = coalesce(p_timezone, timezone),
    brand_colour = p_brand_colour, calendar_colour = p_calendar_colour
  where id = p_client_id;

  insert into public.client_internal
    (client_id, account_owner_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount)
  values
    (p_client_id, p_account_owner_id, p_notes, p_billing_email, p_vat_number, p_billing_address, p_payment_terms,
     p_currency, p_retainer_amount)
  on conflict (client_id) do update set
    account_owner_id = excluded.account_owner_id, notes = excluded.notes,
    billing_email = excluded.billing_email, vat_number = excluded.vat_number,
    billing_address = excluded.billing_address, payment_terms = excluded.payment_terms,
    currency = coalesce(excluded.currency, public.client_internal.currency),
    retainer_amount = excluded.retainer_amount;
end; $$;

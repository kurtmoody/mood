-- Migration 0025 — dedicated calendar_colour.
--
-- A per-client colour used ONLY for calendar tagging, kept separate from brand_colour
-- (the client's brand-identity colour, left untouched). create_client / update_client
-- gain an optional p_calendar_colour alongside every existing param.
--
-- The RPCs grow a param, so their signature changes — drop the old signature, then
-- recreate. Idempotent: the add-column is guarded, and on re-run the drops simply no-op
-- (the old-arity functions no longer exist) before create-or-replace.

-- ---------- 1. column ----------
alter table public.client add column if not exists calendar_colour text;

-- ---------- 2. create_client (+ p_calendar_colour; everything else unchanged) ----------
drop function if exists public.create_client(text, text, text, text, text, text, text, text, text, text, text, text, numeric);

create or replace function public.create_client(
  p_name text,
  p_status text default 'active',
  p_website text default null,
  p_industry text default null,
  p_timezone text default 'Europe/Malta',
  p_brand_colour text default null,
  p_calendar_colour text default null,
  p_notes text default null,
  p_billing_email text default null,
  p_vat_number text default null,
  p_billing_address text default null,
  p_payment_terms text default null,
  p_currency text default 'EUR',
  p_retainer_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_agency uuid;
  v_client uuid;
begin
  if v_uid is null then
    raise exception 'create_client: not authenticated (auth.uid() is null)';
  end if;

  select m.scope_id into v_agency
    from public.membership m
   where m.user_id = v_uid
     and m.scope_type = 'agency'
     and m.role in ('agency_admin','agency_member')
   order by m.created_at
   limit 1;

  if v_agency is null then
    raise exception 'create_client: no agency_admin/member membership for this user';
  end if;

  insert into public.client (agency_id, name, status, website, industry, timezone, brand_colour, calendar_colour)
  values (v_agency, p_name, coalesce(p_status,'active'), p_website, p_industry,
          coalesce(p_timezone,'Europe/Malta'), p_brand_colour, p_calendar_colour)
  returning id into v_client;

  insert into public.client_internal
    (client_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount)
  values
    (v_client, p_notes, p_billing_email, p_vat_number, p_billing_address, p_payment_terms,
     coalesce(p_currency,'EUR'), p_retainer_amount);

  return v_client;
end;
$$;

-- ---------- 3. update_client (+ p_calendar_colour; everything else unchanged) ----------
drop function if exists public.update_client(uuid, text, text, text, text, text, text, uuid, text, text, text, text, text, text, numeric);

create or replace function public.update_client(
  p_client_id uuid,
  p_name text,
  p_status text default 'active',
  p_website text default null,
  p_industry text default null,
  p_timezone text default 'Europe/Malta',
  p_brand_colour text default null,
  p_calendar_colour text default null,
  p_account_owner_id uuid default null,
  p_notes text default null,
  p_billing_email text default null,
  p_vat_number text default null,
  p_billing_address text default null,
  p_payment_terms text default null,
  p_currency text default 'EUR',
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
    name = p_name, status = coalesce(p_status,'active'), website = p_website,
    industry = p_industry, timezone = coalesce(p_timezone,'Europe/Malta'),
    brand_colour = p_brand_colour, calendar_colour = p_calendar_colour
  where id = p_client_id;

  insert into public.client_internal
    (client_id, account_owner_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount)
  values
    (p_client_id, p_account_owner_id, p_notes, p_billing_email, p_vat_number, p_billing_address, p_payment_terms,
     coalesce(p_currency,'EUR'), p_retainer_amount)
  on conflict (client_id) do update set
    account_owner_id = excluded.account_owner_id, notes = excluded.notes,
    billing_email = excluded.billing_email, vat_number = excluded.vat_number,
    billing_address = excluded.billing_address, payment_terms = excluded.payment_terms,
    currency = excluded.currency, retainer_amount = excluded.retainer_amount;
end; $$;

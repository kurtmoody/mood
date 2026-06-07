-- Migration 0006 — edit clients + assign account owner from the team directory

-- 1. Repoint account owner to the team_member directory (column is empty/unused).
alter table public.client_internal drop column if exists account_owner_id;
alter table public.client_internal add column account_owner_id uuid references public.team_member(id) on delete set null;

-- 2. update_client RPC: atomic update of client + client_internal (incl. account owner).
create or replace function public.update_client(
  p_client_id uuid,
  p_name text,
  p_status text default 'active',
  p_website text default null,
  p_industry text default null,
  p_timezone text default 'Europe/Malta',
  p_brand_colour text default null,
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
    industry = p_industry, timezone = coalesce(p_timezone,'Europe/Malta'), brand_colour = p_brand_colour
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

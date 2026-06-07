-- Migration 0004 — create_client RPC (SECURITY DEFINER, atomic create)
create or replace function public.create_client(
  p_name text,
  p_status text default 'active',
  p_website text default null,
  p_industry text default null,
  p_timezone text default 'Europe/Malta',
  p_brand_colour text default null,
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

  insert into public.client (agency_id, name, status, website, industry, timezone, brand_colour)
  values (v_agency, p_name, coalesce(p_status,'active'), p_website, p_industry,
          coalesce(p_timezone,'Europe/Malta'), p_brand_colour)
  returning id into v_client;

  insert into public.client_internal
    (client_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount)
  values
    (v_client, p_notes, p_billing_email, p_vat_number, p_billing_address, p_payment_terms,
     coalesce(p_currency,'EUR'), p_retainer_amount);

  return v_client;
end;
$$;

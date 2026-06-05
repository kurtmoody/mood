-- ============================================================
-- Migration 0001 — Client CRM (schema only, no UI)
-- Idempotent: safe to run repeatedly in Supabase → SQL Editor.
-- Does NOT touch schema.sql (that stays the fresh-setup reference).
--
-- RLS design note: RLS is row-level, not column-level. `client` is
-- readable by client-portal users (client_read), so sensitive internal
-- and billing data must NOT live on `client` — it goes in agency-only
-- tables below, gated by is_agency_for_client().
-- ============================================================

-- ---------- 1. client: non-sensitive columns only ----------
alter table public.client add column if not exists website  text;
alter table public.client add column if not exists industry text;

-- status already exists (text default 'active'); constrain its values.
alter table public.client drop constraint if exists client_status_check;
alter table public.client add  constraint client_status_check
  check (status in ('prospect','active','paused','archived'));

-- ---------- 2. client_internal (agency-only, one row per client) ----------
create table if not exists public.client_internal (
  client_id        uuid not null unique references public.client(id) on delete cascade,
  account_owner_id uuid references auth.users(id) on delete set null,
  notes            text,
  billing_email    text,
  vat_number       text,
  billing_address  text,
  payment_terms    text,
  currency         text default 'EUR',
  retainer_amount  numeric(12,2),
  created_at       timestamptz default now()
);

-- ---------- 3. client_contact (agency-only) ----------
create table if not exists public.client_contact (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.client(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  role       text,
  is_primary boolean default false,
  user_id    uuid references auth.users(id) on delete set null,  -- set when invited to portal
  created_at timestamptz default now()
);

-- At most one primary contact per client.
create unique index if not exists client_contact_one_primary
  on public.client_contact (client_id) where is_primary;

-- ---------- 4. brand_asset (agency-only) ----------
create table if not exists public.brand_asset (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.client(id) on delete cascade,
  kind       text not null check (kind in ('logo','colour','font','guideline','other')),
  label      text,
  value      text,
  notes      text,
  created_at timestamptz default now()
);

-- ---------- 5. RLS: agency-only read + write on all three ----------
alter table public.client_internal enable row level security;
alter table public.client_contact  enable row level security;
alter table public.brand_asset     enable row level security;

-- client_internal
drop policy if exists client_internal_read  on public.client_internal;
create policy client_internal_read on public.client_internal
  for select using (public.is_agency_for_client(client_id));
drop policy if exists client_internal_write on public.client_internal;
create policy client_internal_write on public.client_internal
  for all to authenticated
  using      (public.is_agency_for_client(client_id))
  with check (public.is_agency_for_client(client_id));

-- client_contact
drop policy if exists client_contact_read  on public.client_contact;
create policy client_contact_read on public.client_contact
  for select using (public.is_agency_for_client(client_id));
drop policy if exists client_contact_write on public.client_contact;
create policy client_contact_write on public.client_contact
  for all to authenticated
  using      (public.is_agency_for_client(client_id))
  with check (public.is_agency_for_client(client_id));

-- brand_asset
drop policy if exists brand_asset_read  on public.brand_asset;
create policy brand_asset_read on public.brand_asset
  for select using (public.is_agency_for_client(client_id));
drop policy if exists brand_asset_write on public.brand_asset;
create policy brand_asset_write on public.brand_asset
  for all to authenticated
  using      (public.is_agency_for_client(client_id))
  with check (public.is_agency_for_client(client_id));

-- pgTap test for 0046 — set_agency_cost_per_hour: admin-only + validation.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0046.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000046', 'cph_adminA@test.local'),
  ('72000000-0000-0000-0000-000000000046', 'cph_memberA@test.local'),
  ('8b000000-0000-0000-0000-000000000046', 'cph_adminB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000046', 'CPH Agency A'),
  ('b0000000-0000-0000-0000-000000000046', 'CPH Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000046', 'agency', 'a0000000-0000-0000-0000-000000000046', 'agency_admin'),
  ('72000000-0000-0000-0000-000000000046', 'agency', 'a0000000-0000-0000-0000-000000000046', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000046', 'agency', 'b0000000-0000-0000-0000-000000000046', 'agency_admin');

create temp table _t (seq int, line text);
select plan(4);

-- 1) admin sets the rate → persists
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000046","role":"authenticated"}';
select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000046', 35);
insert into _t select 1, is(
  (select cost_per_hour from public.agency where id='a0000000-0000-0000-0000-000000000046'),
  35::numeric, 'admin sets the agency cost-per-hour');

-- 2) a non-admin agency member cannot set it
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000046","role":"authenticated"}';
insert into _t select 2, throws_ok(
  $$ select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000046', 50) $$, 'P0001');

-- 3) an admin of another agency cannot set it (cross-tenant)
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000046","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000046', 50) $$, 'P0001');

-- 4) a negative rate is rejected
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000046","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000046', -1) $$, 'P0001');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

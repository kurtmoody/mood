-- pgTap test for 0047 — agency_internal: admin-only read RLS + admin-only setter.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0047.
--
-- This tests RLS READS, so it becomes the authenticated role (owner bypasses RLS):
-- grant insert on _t to authenticated and plan() BEFORE the role switch; drive the
-- caller via the request.jwt.claims GUC. The setter is SECURITY DEFINER (reads auth.uid()
-- from the GUC), so it works the same under the authenticated role.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000047', 'ai_adminA@test.local'),
  ('72000000-0000-0000-0000-000000000047', 'ai_memberA@test.local'),
  ('8b000000-0000-0000-0000-000000000047', 'ai_adminB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000047', 'AI Agency A'),
  ('b0000000-0000-0000-0000-000000000047', 'AI Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000047', 'agency', 'a0000000-0000-0000-0000-000000000047', 'agency_admin'),
  ('72000000-0000-0000-0000-000000000047', 'agency', 'a0000000-0000-0000-0000-000000000047', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000047', 'agency', 'b0000000-0000-0000-0000-000000000047', 'agency_admin');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(5);

-- ===== admin A sets the rate, then reads it back under RLS =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000047","role":"authenticated"}';
select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000047', 35);

-- 1) admin sets + can read the rate (RLS allows agency_admin)
insert into _t select 1, is(
  (select cost_per_hour from public.agency_internal where agency_id='a0000000-0000-0000-0000-000000000047'),
  35::numeric, 'admin sets and reads the rate');

-- 2) a non-admin agency member CANNOT read it (RLS returns nothing)
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000047","role":"authenticated"}';
insert into _t select 2, is_empty(
  $$ select 1 from public.agency_internal where agency_id='a0000000-0000-0000-0000-000000000047' $$,
  'a non-admin agency member cannot read the cost rate');

-- 3) an admin of another agency CANNOT read it (cross-tenant)
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000047","role":"authenticated"}';
insert into _t select 3, is_empty(
  $$ select 1 from public.agency_internal where agency_id='a0000000-0000-0000-0000-000000000047' $$,
  'a cross-tenant admin cannot read the cost rate');

-- 4) a non-admin agency member cannot set it
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000047","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000047', 50) $$, 'P0001');

-- 5) a cross-tenant admin cannot set it
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000047","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.set_agency_cost_per_hour('a0000000-0000-0000-0000-000000000047', 50) $$, 'P0001');

-- ---------- emit ----------
set local role postgres;
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

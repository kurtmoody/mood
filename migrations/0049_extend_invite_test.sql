-- pgTap test for 0049 — extend_invite: admin-only, pending-only, scope-checked.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0035 + 0049.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000049', 'ei_admin@test.local'),
  ('72000000-0000-0000-0000-000000000049', 'ei_member@test.local'),
  ('8b000000-0000-0000-0000-000000000049', 'ei_outsider@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000049', 'EI Agency A'),
  ('b0000000-0000-0000-0000-000000000049', 'EI Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000049', 'agency', 'a0000000-0000-0000-0000-000000000049', 'agency_admin'),
  ('72000000-0000-0000-0000-000000000049', 'agency', 'a0000000-0000-0000-0000-000000000049', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000049', 'agency', 'b0000000-0000-0000-0000-000000000049', 'agency_admin');

-- A pending invite already near expiry, and a revoked one that must stay untouched.
insert into public.invite (id, email, scope_type, scope_id, role, status, expires_at, invited_by) values
  ('10000000-0000-0000-0000-000000000049', 'ei_new@test.local', 'agency', 'a0000000-0000-0000-0000-000000000049', 'agency_member', 'pending', now() + interval '1 hour', '71000000-0000-0000-0000-000000000049'),
  ('20000000-0000-0000-0000-000000000049', 'ei_old@test.local', 'agency', 'a0000000-0000-0000-0000-000000000049', 'agency_member', 'revoked', now() - interval '1 day', '71000000-0000-0000-0000-000000000049');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(5);

-- 1) admin extends a pending invite → expiry moves to ~7 days out
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000049","role":"authenticated"}';
select public.extend_invite('10000000-0000-0000-0000-000000000049');
set local role postgres;
insert into _t select 1, ok(
  (select expires_at from public.invite where id = '10000000-0000-0000-0000-000000000049')
    > now() + interval '6 days',
  'admin extends a pending invite to ~7 days out');

-- 2) extending a revoked invite is a silent no-op (status filter)
set local role authenticated;
select public.extend_invite('20000000-0000-0000-0000-000000000049');
set local role postgres;
insert into _t select 2, ok(
  (select expires_at from public.invite where id = '20000000-0000-0000-0000-000000000049') < now(),
  'a revoked invite is not extended');

-- 3) a non-admin agency member cannot extend
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000049","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.extend_invite('10000000-0000-0000-0000-000000000049') $$, 'P0001');

-- 4) a cross-tenant admin cannot extend
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000049","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.extend_invite('10000000-0000-0000-0000-000000000049') $$, 'P0001');

-- 5) unknown invite id raises
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000049","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.extend_invite('99000000-0000-0000-0000-000000000049') $$, 'P0001');

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

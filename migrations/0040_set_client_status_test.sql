-- pgTap test for 0040 — set_client_status authorisation + validation.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0040.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000040', 'cs_agencyA@test.local'),
  ('8b000000-0000-0000-0000-000000000040', 'cs_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000040', 'CS Agency A'),
  ('b0000000-0000-0000-0000-000000000040', 'CS Agency B');

insert into public.client (id, agency_id, name, status) values
  ('ca000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000040', 'CS Client A', 'active');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000040', 'agency', 'a0000000-0000-0000-0000-000000000040', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000040', 'agency', 'b0000000-0000-0000-0000-000000000040', 'agency_member');

create temp table _t (seq int, line text);
select plan(4);

-- ===== agency A member acts =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000040","role":"authenticated"}';

-- 1) archive
select public.set_client_status('ca000000-0000-0000-0000-000000000040', 'archived');
insert into _t select 1, is(
  (select status from public.client where id = 'ca000000-0000-0000-0000-000000000040'),
  'archived', 'agency member archives their client'
);

-- 2) reactivate
select public.set_client_status('ca000000-0000-0000-0000-000000000040', 'active');
insert into _t select 2, is(
  (select status from public.client where id = 'ca000000-0000-0000-0000-000000000040'),
  'active', 'agency member reactivates their client'
);

-- 3) invalid status is rejected
insert into _t select 3, throws_ok(
  $$ select public.set_client_status('ca000000-0000-0000-0000-000000000040', 'frozen') $$,
  'P0001'
);

-- 4) an agency member of another agency cannot set status (cross-tenant)
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000040","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_client_status('ca000000-0000-0000-0000-000000000040', 'archived') $$,
  'P0001'
);

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

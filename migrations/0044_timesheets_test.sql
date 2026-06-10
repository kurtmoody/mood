-- pgTap test for 0044 — timesheets: timer + manual logging auth/validation + RLS.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0044.
--
-- RPCs are SECURITY DEFINER (read auth.uid() from the request.jwt.claims GUC); we stay as
-- the owner for the RPC calls + true-state reads. The cross-tenant read tests RLS, so it
-- switches to the authenticated role — grant insert on _t to authenticated, plan() first.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000044', 'ts_uA@test.local'),
  ('72000000-0000-0000-0000-000000000044', 'ts_uA2@test.local'),
  ('8b000000-0000-0000-0000-000000000044', 'ts_uB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000044', 'TS Agency A'),
  ('b0000000-0000-0000-0000-000000000044', 'TS Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000044', 'a0000000-0000-0000-0000-000000000044', 'TS Client A'),
  ('cb000000-0000-0000-0000-000000000044', 'b0000000-0000-0000-0000-000000000044', 'TS Client B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000044', 'agency', 'a0000000-0000-0000-0000-000000000044', 'agency_member'),
  ('72000000-0000-0000-0000-000000000044', 'agency', 'a0000000-0000-0000-0000-000000000044', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000044', 'agency', 'b0000000-0000-0000-0000-000000000044', 'agency_member');

create temp table _ctx (id uuid);
create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(8);

-- ===== uA starts a timer =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000044","role":"authenticated"}';
insert into _ctx select public.start_timer('ca000000-0000-0000-0000-000000000044', null, 'working');

-- 1) running entry (ended_at null)
insert into _t select 1, is(
  (select ended_at from public.time_entry where id=(select id from _ctx)),
  null::timestamptz, 'start_timer creates a running entry');

-- 2) a second start while one runs is rejected
insert into _t select 2, throws_ok(
  $$ select public.start_timer('ca000000-0000-0000-0000-000000000044', null, 'again') $$, 'P0001');

-- 3) a non-owner cannot stop it
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000044","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.stop_timer((select id from _ctx)) $$, 'P0001');

-- 4) the owner stops it (explicit end = start + 1h) → duration 60
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000044","role":"authenticated"}';
select public.stop_timer((select id from _ctx),
  (select started_at from public.time_entry where id=(select id from _ctx)) + interval '1 hour');
insert into _t select 4, is(
  (select duration_minutes from public.time_entry where id=(select id from _ctx)),
  60, 'stop_timer computes duration (owner-only)');

-- 5) manual log_time computes duration (09:00 → 11:30 = 150)
select public.log_time('ca000000-0000-0000-0000-000000000044', null,
  '2026-07-01 09:00:00+00', '2026-07-01 11:30:00+00', 'manual');
insert into _t select 5, is(
  (select duration_minutes from public.time_entry
     where client_id='ca000000-0000-0000-0000-000000000044' and note='manual'),
  150, 'log_time computes duration');

-- 6) log_time with end <= start is rejected
insert into _t select 6, throws_ok(
  $$ select public.log_time('ca000000-0000-0000-0000-000000000044', null,
       '2026-07-01 11:00:00+00', '2026-07-01 10:00:00+00', 'bad') $$, 'P0001');

-- 7) cross-tenant: agency B member cannot log against agency A's client
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000044","role":"authenticated"}';
insert into _t select 7, throws_ok(
  $$ select public.log_time('ca000000-0000-0000-0000-000000000044', null,
       '2026-07-01 09:00:00+00', '2026-07-01 10:00:00+00', 'sneaky') $$, 'P0001');

-- 8) cross-tenant read: agency B member sees no agency A entries (RLS)
set local role authenticated;
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000044","role":"authenticated"}';
insert into _t select 8, is_empty(
  $$ select 1 from public.time_entry $$,
  'cross-tenant agency cannot read another agency''s time entries');

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

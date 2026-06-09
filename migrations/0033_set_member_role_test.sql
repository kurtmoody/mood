-- pgTap test for 0033 — set_member_role authorisation + last-admin lockout.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0033.
--
-- set_member_role keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive
-- the caller via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures (agency A has two admins + a member; agency B is the cross-tenant) ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000033', 'role_admin1@test.local'),
  ('72000000-0000-0000-0000-000000000033', 'role_admin2@test.local'),
  ('7c000000-0000-0000-0000-000000000033', 'role_member1@test.local'),
  ('8b000000-0000-0000-0000-000000000033', 'role_adminB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000033', 'Role Agency A'),
  ('b0000000-0000-0000-0000-000000000033', 'Role Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000033', 'agency', 'a0000000-0000-0000-0000-000000000033', 'agency_admin'),
  ('72000000-0000-0000-0000-000000000033', 'agency', 'a0000000-0000-0000-0000-000000000033', 'agency_admin'),
  ('7c000000-0000-0000-0000-000000000033', 'agency', 'a0000000-0000-0000-0000-000000000033', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000033', 'agency', 'b0000000-0000-0000-0000-000000000033', 'agency_admin');

create temp table _t (seq int, line text);
select plan(6);

-- ===== admin1 acts =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000033","role":"authenticated"}';

-- 1) promote member1 → admin  (A now has 3 admins)
select public.set_member_role('7c000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_admin');
insert into _t select 1, is(
  (select m.role::text from public.membership m
     where m.user_id='7c000000-0000-0000-0000-000000000033' and m.scope_type='agency' and m.scope_id='a0000000-0000-0000-0000-000000000033'),
  'agency_admin', 'admin promotes member → admin'
);

-- 2) demote member1 → member  (other admins remain → allowed)
select public.set_member_role('7c000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_member');
insert into _t select 2, is(
  (select m.role::text from public.membership m
     where m.user_id='7c000000-0000-0000-0000-000000000033' and m.scope_type='agency' and m.scope_id='a0000000-0000-0000-0000-000000000033'),
  'agency_member', 'admin demotes admin → member while another admin remains'
);

-- setup: demote admin2 → member, leaving admin1 as the SOLE admin of A
select public.set_member_role('72000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_member');

-- 3) the last admin cannot be demoted
insert into _t select 3, throws_ok(
  $$ select public.set_member_role('71000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_member') $$,
  'P0001'
);

-- 4) a non-admin member cannot call it (member1 is now a member)
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000033","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.set_member_role('71000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_member') $$,
  'P0001'
);

-- 5) an admin of another agency cannot touch this one
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000033","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.set_member_role('7c000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'agency_member') $$,
  'P0001'
);

-- 6) an invalid role value is rejected
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000033","role":"authenticated"}';
insert into _t select 6, throws_ok(
  $$ select public.set_member_role('7c000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000033', 'superuser') $$,
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

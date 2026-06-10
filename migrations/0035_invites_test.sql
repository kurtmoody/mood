-- pgTap test for 0035 — invite creation authorisation + accept_pending_invites grants.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0035.
--
-- RPCs key off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state). accept reads the
-- caller's email from auth.users by auth.uid(), so each invitee user is given a matching email.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000035', 'inv_adminA@test.local'),
  ('8b000000-0000-0000-0000-000000000035', 'inv_adminB@test.local'),
  ('11000000-0000-0000-0000-000000000035', 'aginv@test.local'),   -- matches the agency invite
  ('22000000-0000-0000-0000-000000000035', 'clinv@test.local'),   -- matches the client invite
  ('33000000-0000-0000-0000-000000000035', 'exp@test.local'),     -- matches an expired invite
  ('44000000-0000-0000-0000-000000000035', 'rev@test.local'),     -- matches a revoked invite
  ('55000000-0000-0000-0000-000000000035', 'none@test.local');    -- no invite at all

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000035', 'Invite Agency A'),
  ('b0000000-0000-0000-0000-000000000035', 'Invite Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000035', 'a0000000-0000-0000-0000-000000000035', 'Client of A'),
  ('cb000000-0000-0000-0000-000000000035', 'b0000000-0000-0000-0000-000000000035', 'Client of B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000035', 'agency', 'a0000000-0000-0000-0000-000000000035', 'agency_admin'),
  ('8b000000-0000-0000-0000-000000000035', 'agency', 'b0000000-0000-0000-0000-000000000035', 'agency_admin');

create temp table _t (seq int, line text);
select plan(11);

-- ===== admin A creates invites =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000035","role":"authenticated"}';

-- 1) agency invite
select public.create_invite('aginv@test.local', 'agency', 'a0000000-0000-0000-0000-000000000035', 'agency_member');
insert into _t select 1, isnt_empty(
  $$ select 1 from public.invite where email='aginv@test.local' and scope_type='agency'
       and scope_id='a0000000-0000-0000-0000-000000000035' and status='pending' $$,
  'admin creates a pending agency invite'
);

-- 2) client invite
select public.create_invite('clinv@test.local', 'client', 'ca000000-0000-0000-0000-000000000035', 'client_approver');
insert into _t select 2, isnt_empty(
  $$ select 1 from public.invite where email='clinv@test.local' and scope_type='client'
       and scope_id='ca000000-0000-0000-0000-000000000035' and status='pending' $$,
  'admin creates a pending client invite'
);

-- a revoked invite (created then revoked) for the revoked-grants-nothing test
select public.create_invite('rev@test.local', 'client', 'ca000000-0000-0000-0000-000000000035', 'client_viewer');
select public.revoke_invite(
  (select id from public.invite where email='rev@test.local' and status='pending')
);

-- ===== authorisation failures =====

-- 3) a non-admin (no agency membership) cannot create
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000035","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.create_invite('x@test.local', 'agency', 'a0000000-0000-0000-0000-000000000035', 'agency_member') $$,
  'P0001'
);

-- 4) cross-tenant: admin B cannot invite to agency A's client
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000035","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.create_invite('y@test.local', 'client', 'ca000000-0000-0000-0000-000000000035', 'client_approver') $$,
  'P0001'
);

-- an expired pending invite (inserted directly — can't create one in the past via the RPC)
set local role postgres;
insert into public.invite (email, scope_type, scope_id, role, status, expires_at)
values ('exp@test.local', 'client', 'ca000000-0000-0000-0000-000000000035', 'client_approver',
        'pending', now() - interval '1 day');

-- ===== accept_pending_invites =====

-- 5) agency invitee gets agency_member membership
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();
insert into _t select 5, is(
  (select role::text from public.membership
     where user_id='11000000-0000-0000-0000-000000000035' and scope_type='agency'
       and scope_id='a0000000-0000-0000-0000-000000000035'),
  'agency_member', 'agency invitee accepts → agency_member membership'
);

-- 6) client invitee gets the client membership for that client
set local request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();
insert into _t select 6, is(
  (select role::text from public.membership
     where user_id='22000000-0000-0000-0000-000000000035' and scope_type='client'
       and scope_id='ca000000-0000-0000-0000-000000000035'),
  'client_approver', 'client invitee accepts → client membership for that client'
);

-- 7) DATA-LEAK GUARD: the client invitee has NO agency membership
insert into _t select 7, is(
  (select count(*)::int from public.membership
     where user_id='22000000-0000-0000-0000-000000000035' and scope_type='agency'),
  0, 'client invitee gets NO agency membership'
);

-- 8) expired invite grants nothing
set local request.jwt.claims = '{"sub":"33000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();
insert into _t select 8, is(
  (select count(*)::int from public.membership where user_id='33000000-0000-0000-0000-000000000035'),
  0, 'expired invite grants nothing'
);

-- 9) revoked invite grants nothing
set local request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();
insert into _t select 9, is(
  (select count(*)::int from public.membership where user_id='44000000-0000-0000-0000-000000000035'),
  0, 'revoked invite grants nothing'
);

-- 10) a user with no invite gets nothing
set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();
insert into _t select 10, is(
  (select count(*)::int from public.membership where user_id='55000000-0000-0000-0000-000000000035'),
  0, 'a user with no invite gets nothing'
);

-- 11) idempotent re-acceptance: a fresh pending invite for someone who ALREADY has
--     the exact membership grants no duplicate (the on-conflict-do-nothing path).
--     The prior invite (assertion 5) is now 'accepted', so this new 'pending' row is
--     allowed past the one-pending partial index.
set local role postgres;
insert into public.invite (email, scope_type, scope_id, role, status)
values ('aginv@test.local', 'agency', 'a0000000-0000-0000-0000-000000000035', 'agency_member', 'pending');

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000035","role":"authenticated"}';
select public.accept_pending_invites();  -- must not error; the script aborts if it does
insert into _t select 11, is(
  (select count(*)::int from public.membership
     where user_id='11000000-0000-0000-0000-000000000035' and scope_type='agency'
       and scope_id='a0000000-0000-0000-0000-000000000035' and role='agency_member'),
  1, 're-accepting an already-held membership stays at exactly one (no duplicate, role unchanged)'
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

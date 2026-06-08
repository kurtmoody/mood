-- pgTap test for 0020 — revoke removes the membership (scoped). Paste into the
-- Supabase SQL editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0020_revoke_access.sql applied first.
--
-- Proven hosted pattern: temp _t + grant + plan() before any role switch; act via
-- `set local role authenticated` + a jwt-claims GUC; `set local role postgres` (not
-- reset) to read true state; aggregate via union all; is_empty/isnt_empty.
-- pgTap here only ever runs as the owner (postgres); only the RPC calls run as users.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner) ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000020', 'revoke_agency@test.local'),
  ('60000000-0000-0000-0000-000000000020', 'revoke_client@test.local');

insert into public.agency (id, name)
values ('a0000000-0000-0000-0000-000000000020', 'Revoke Test Agency');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000020', 'Revoke Client A'),
  ('c2000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000020', 'Revoke Client B');

-- Portal-enabled contact for Client A, email matching the client user.
insert into public.client_contact (id, client_id, first_name, email, portal_access)
values ('cc000000-0000-0000-0000-000000000020', 'c1000000-0000-0000-0000-000000000020', 'Client', 'revoke_client@test.local', true);

-- The agency user who performs the revoke.
insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000020', 'agency', 'a0000000-0000-0000-0000-000000000020', 'agency_admin');

-- The client user, as if already logged in: client membership for A (to be revoked),
-- PLUS an agency membership and a client membership at a DIFFERENT client (must survive).
insert into public.membership (user_id, scope_type, scope_id, role) values
  ('60000000-0000-0000-0000-000000000020', 'client', 'c1000000-0000-0000-0000-000000000020', 'client_approver'),
  ('60000000-0000-0000-0000-000000000020', 'agency', 'a0000000-0000-0000-0000-000000000020', 'agency_member'),
  ('60000000-0000-0000-0000-000000000020', 'client', 'c2000000-0000-0000-0000-000000000020', 'client_approver');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;

select plan(6);

-- 1) the client membership exists BEFORE revoke.
insert into _t select 1, isnt_empty(
  $$ select 1 from public.membership
       where user_id='60000000-0000-0000-0000-000000000020'
         and scope_type='client' and scope_id='c1000000-0000-0000-0000-000000000020' $$,
  'client membership exists before revoke'
);

-- ---------- agency revokes ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000020","role":"authenticated"}';
select public.set_contact_portal_access('cc000000-0000-0000-0000-000000000020', false);

-- read state after revoke (as owner)
set local role postgres;

-- 2) the client membership for THIS client is gone.
insert into _t select 2, is_empty(
  $$ select 1 from public.membership
       where user_id='60000000-0000-0000-0000-000000000020'
         and scope_type='client' and scope_id='c1000000-0000-0000-0000-000000000020' $$,
  'client membership for this client is removed on revoke'
);

-- 3) the contact's portal_access is now false.
insert into _t select 3, is(
  (select portal_access from public.client_contact where id='cc000000-0000-0000-0000-000000000020')::text,
  'false',
  'contact portal_access is now false'
);

-- 4) the user's AGENCY membership survives (not touched).
insert into _t select 4, isnt_empty(
  $$ select 1 from public.membership
       where user_id='60000000-0000-0000-0000-000000000020'
         and scope_type='agency' and scope_id='a0000000-0000-0000-0000-000000000020' $$,
  'the user''s agency membership survives revoke'
);

-- 5) the user's membership at ANOTHER client survives (not touched).
insert into _t select 5, isnt_empty(
  $$ select 1 from public.membership
       where user_id='60000000-0000-0000-0000-000000000020'
         and scope_type='client' and scope_id='c2000000-0000-0000-0000-000000000020' $$,
  'the user''s membership at another client survives revoke'
);

-- ---------- the revoked user tries to silently re-claim ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000020","role":"authenticated"}';
select public.claim_client_access();

set local role postgres;

-- 6) a fresh claim grants nothing (portal_access is false) — still no membership.
insert into _t select 6, is_empty(
  $$ select 1 from public.membership
       where user_id='60000000-0000-0000-0000-000000000020'
         and scope_type='client' and scope_id='c1000000-0000-0000-0000-000000000020' $$,
  'a fresh claim after revoke grants nothing'
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

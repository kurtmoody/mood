-- pgTap test for 0016 — proves the content tables are RPC-only at the DB layer.
-- Paste into the Supabase SQL editor and run. No basejump dependency; only pgtap.
-- Wrapped in begin; … rollback; so nothing persists.
-- Requires 0016_close_write_sidedoor.sql to be applied first (otherwise ci_write
-- would still permit the agency user's direct INSERT and the first assertion fails).
--
-- Mechanics mirror the 0015 test: fixtures inserted as the owner (RLS bypassed),
-- then we become the agency user via `set local role authenticated` + a jwt-claims
-- GUC. Each assertion's TAP line is captured into a temp table — necessary because
-- the two assertions straddle a role switch (INSERT check as the agency user, then
-- the UPDATE reality-check as the owner) — and emitted as one union-all result set
-- so the editor returns every line, not just the last.
--
-- INSERT under RLS with no write policy raises (SQLSTATE 42501) → throws_ok.
-- UPDATE under RLS with no write policy affects zero rows SILENTLY (no error) →
-- assert the unchanged row with is(), never throws_ok.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner; RLS bypassed) ----------
insert into public.agency (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Sidedoor Test Agency');

insert into public.client (id, agency_id, name)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Sidedoor Test Client');

-- An agency_admin for the test agency (only id + email are needed on auth.users).
insert into auth.users (id, email)
values ('55555555-5555-5555-5555-555555555555', 'sidedoor_admin@test.local');

insert into public.membership (user_id, scope_type, scope_id, role)
values ('55555555-5555-5555-5555-555555555555', 'agency',
        '11111111-1111-1111-1111-111111111111', 'agency_admin');

-- A post for that agency's client (content_type defaults to 'post').
insert into public.content_item (id, client_id, status, title)
values ('e0000000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'client_review', 'Locked post');

-- ---------- become the agency user ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select plan(2);
create temp table _t (seq int, line text);

-- 1) A direct INSERT must be rejected — there is no write policy, so RLS throws.
insert into _t
select 1, throws_ok(
  $$ insert into public.content_item (client_id, status, title)
       values ('22222222-2222-2222-2222-222222222222', 'draft', 'direct insert attempt') $$,
  '42501',
  'direct INSERT into content_item is rejected — writes are RPC-only'
);

-- 2) A direct UPDATE silently affects zero rows (RLS, no write policy). Attempt it,
--    then drop back to the owner to read the true state and assert it is unchanged.
update public.content_item set status = 'posted'
 where id = 'e0000000-0000-0000-0000-000000000001';

reset role;

insert into _t
select 2, is(
  (select status from public.content_item where id = 'e0000000-0000-0000-0000-000000000001')::text,
  'client_review',
  'direct UPDATE changed nothing — 0 rows affected under RLS'
);

-- ---------- emit every assertion line (plus the pgTap footer) as one result set ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

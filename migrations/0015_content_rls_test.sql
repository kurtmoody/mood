-- pgTap test for 0015 content RLS. Paste into the Supabase SQL editor and run.
-- No basejump-supabase_test_helpers dependency (not installable on hosted PG) —
-- only pgtap, which IS available. Wrapped in begin; … rollback; so nothing persists.
-- Requires 0015_content_rls.sql to be applied first.
--
-- Mechanics:
--  * Fixtures are inserted as the table owner (the editor's default role), which
--    bypasses RLS — this is setup, not a test of the write path.
--  * We then become the test user with `set local role authenticated` plus a
--    `request.jwt.claims` GUC, so (select auth.uid()) resolves to that user and the
--    `to authenticated` policies apply.
--  * pgtap's plan()/assertions/finish() all run AS authenticated, because pgtap
--    tracks state in session temp tables that one role cannot read across a role
--    switch. Every assertion is therefore from the client user's point of view —
--    exactly what we want to verify. We query fixtures by fixed UUID so the checks
--    are precise and never collide with existing data.
--  * RLS SELECT failures are SILENT (filtered to zero rows, no error), so we assert
--    with is_empty / isnt_empty — never throws_ok.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner; RLS bypassed) ----------
-- A self-contained test agency with two clients: A is the test user's, B is the
-- "other" client used for the cross-tenant isolation check.
insert into public.agency (id, name)
values ('11111111-1111-1111-1111-111111111111', 'RLS Test Agency');

insert into public.client (id, agency_id, name) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'RLS Test Client A'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'RLS Test Client B');

-- The test user (minimal auth.users row) and a client_approver membership for A.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated',
  'authenticated',
  'rls_client@test.local',
  now(), now()
);

insert into public.membership (user_id, scope_type, scope_id, role)
values (
  '44444444-4444-4444-4444-444444444444',
  'client',
  '22222222-2222-2222-2222-222222222222',
  'client_approver'
);

-- Posts: Client A gets a draft, an internal_review and a client_review;
-- Client B gets a client_review (the test user must never see it).
insert into public.content_item (id, client_id, status, content_type, title) values
  ('a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'draft',           'post', 'A draft'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'internal_review', 'post', 'A internal'),
  ('a0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'client_review',   'post', 'A for client'),
  ('b0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'client_review',   'post', 'B for client');

-- Child rows hung off the DRAFT post, to prove they are hidden too.
insert into public.content_version (id, content_item_id, version_no, body)
values ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 1, 'secret draft body');

insert into public.comment (id, content_item_id, author_id, body)
values ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', 'secret draft comment');

-- ---------- become the test client user ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select plan(6);

-- SHOULD see: the client_review post for their own client.
select isnt_empty(
  $$ select id from public.content_item where id = 'a0000000-0000-0000-0000-000000000003' $$,
  'client sees the client_review post for their own client'
);

-- MUST NOT see: their client's draft.
select is_empty(
  $$ select id from public.content_item where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'client cannot see their client''s draft post'
);

-- MUST NOT see: their client's internal_review.
select is_empty(
  $$ select id from public.content_item where id = 'a0000000-0000-0000-0000-000000000002' $$,
  'client cannot see their client''s internal_review post'
);

-- MUST NOT see: the other client's post (cross-tenant isolation).
select is_empty(
  $$ select id from public.content_item where id = 'b0000000-0000-0000-0000-000000000004' $$,
  'client cannot see another client''s post'
);

-- Bonus — child rows of a draft are invisible too.
select is_empty(
  $$ select id from public.content_version where id = 'c0000000-0000-0000-0000-000000000005' $$,
  'client cannot see a version belonging to a draft post'
);

select is_empty(
  $$ select id from public.comment where id = 'd0000000-0000-0000-0000-000000000006' $$,
  'client cannot see a comment belonging to a draft post'
);

select * from finish();

reset role;
rollback;

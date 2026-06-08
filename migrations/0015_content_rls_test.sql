-- pgTap test for 0015 content RLS. Paste into the Supabase SQL editor and run.
-- Wrapped in a transaction and rolled back — leaves no data behind.
-- Requires 0015_content_rls.sql to be applied first.
--
-- RLS SELECT failures are SILENT (rows are filtered, no error is raised), so we
-- assert on row presence with is_empty / isnt_empty — never throws_ok.

begin;

create extension if not exists pgtap;
create extension if not exists "basejump-supabase_test_helpers";

select plan(4);

-- ---------- setup (runs as the editor role → bypasses RLS) ----------
insert into public.agency (id, name)
values ('11111111-1111-1111-1111-111111111111', 'RLS Test Agency');

insert into public.client (id, agency_id, name) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'RLS Test Client A'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'RLS Test Client B');

-- A client_approver user for Client A only.
select tests.create_supabase_user('rls_client', 'rls_client@test.local');
insert into public.membership (user_id, scope_type, scope_id, role)
values (
  tests.get_supabase_uid('rls_client'),
  'client',
  '22222222-2222-2222-2222-222222222222',
  'client_approver'
);

-- Client A: a draft, an internal_review, and a client_review post.
-- Client B: a client_review post (the user must NOT see it).
insert into public.content_item (id, client_id, status, content_type, title) values
  ('aaaa1111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'draft',           'post', 'A draft'),
  ('aaaa1111-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'internal_review', 'post', 'A internal'),
  ('aaaa1111-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'client_review',   'post', 'A for client'),
  ('bbbb2222-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'client_review',   'post', 'B for client');

-- ---------- act: become the client user (RLS now applies) ----------
select tests.authenticate_as('rls_client');

-- ---------- assert ----------
select isnt_empty(
  $$ select id from public.content_item
       where status = 'client_review'
         and client_id = '22222222-2222-2222-2222-222222222222' $$,
  'client sees the client_review post for their own client'
);

select is_empty(
  $$ select id from public.content_item where status = 'draft' $$,
  'client cannot see draft posts'
);

select is_empty(
  $$ select id from public.content_item where status = 'internal_review' $$,
  'client cannot see internal_review posts'
);

select is_empty(
  $$ select id from public.content_item
       where client_id = '33333333-3333-3333-3333-333333333333' $$,
  'client cannot see another client''s posts'
);

select tests.clear_authentication();
select * from finish();

rollback;

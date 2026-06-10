-- pgTap test for 0039 — internal_note RLS (incl. the client leak guard) + RPC auth.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0039.
--
-- This tests RLS READS, so it becomes the authenticated role (owner bypasses RLS):
-- grant insert on _t to authenticated and plan() BEFORE the role switch; drive the
-- caller via the request.jwt.claims GUC. RPCs/helpers are SECURITY DEFINER and read
-- auth.uid() from the GUC, so they work the same under the authenticated role.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000039', 'in_agA1@test.local'),   -- agency A, the author
  ('72000000-0000-0000-0000-000000000039', 'in_agA2@test.local'),   -- agency A, a different member
  ('8b000000-0000-0000-0000-000000000039', 'in_agB@test.local'),    -- agency B (cross-tenant)
  ('7c000000-0000-0000-0000-000000000039', 'in_client@test.local'); -- client of agency A's client

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000039', 'IN Agency A'),
  ('b0000000-0000-0000-0000-000000000039', 'IN Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000039', 'a0000000-0000-0000-0000-000000000039', 'IN Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000039', 'agency', 'a0000000-0000-0000-0000-000000000039', 'agency_member'),
  ('72000000-0000-0000-0000-000000000039', 'agency', 'a0000000-0000-0000-0000-000000000039', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000039', 'agency', 'b0000000-0000-0000-0000-000000000039', 'agency_member'),
  ('7c000000-0000-0000-0000-000000000039', 'client', 'ca000000-0000-0000-0000-000000000039', 'client_approver');

insert into public.content_item (id, client_id, title, status) values
  ('e1000000-0000-0000-0000-000000000039', 'ca000000-0000-0000-0000-000000000039', 'IN Post', 'client_review');
insert into public.task (id, agency_id, title) values
  ('81000000-0000-0000-0000-000000000039', 'a0000000-0000-0000-0000-000000000039', 'IN Task');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(10);

-- ===== agency A member (author) =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000039","role":"authenticated"}';

-- 1) add a note to their post
select public.add_internal_note('post', 'e1000000-0000-0000-0000-000000000039', 'post note');
insert into _t select 1, isnt_empty(
  $$ select 1 from public.internal_note where parent_type='post' and parent_id='e1000000-0000-0000-0000-000000000039' $$,
  'agency member adds a note to their post'
);

-- 2) add a note to their task
select public.add_internal_note('task', '81000000-0000-0000-0000-000000000039', 'task note');
insert into _t select 2, isnt_empty(
  $$ select 1 from public.internal_note where parent_type='task' and parent_id='81000000-0000-0000-0000-000000000039' $$,
  'agency member adds a note to their task'
);

-- 3) the agency member can read both (under RLS)
insert into _t select 3, is(
  (select count(*)::int from public.internal_note where author_id='71000000-0000-0000-0000-000000000039'),
  2, 'agency member reads their notes'
);

-- 4) LEAK GUARD: a client member CANNOT read internal notes on their own post
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000039","role":"authenticated"}';
insert into _t select 4, is_empty(
  $$ select 1 from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039' $$,
  'client cannot read internal notes on their own post'
);

-- 5) cross-tenant agency cannot ADD to agency A's post
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000039","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.add_internal_note('post', 'e1000000-0000-0000-0000-000000000039', 'sneaky') $$,
  'P0001'
);

-- 6) cross-tenant agency cannot READ them either
insert into _t select 6, is_empty(
  $$ select 1 from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039' $$,
  'cross-tenant agency cannot read the notes'
);

-- 7) the author can edit their own note
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000039","role":"authenticated"}';
select public.update_internal_note(
  (select id from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039'),
  'edited body');
insert into _t select 7, is(
  (select body from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039'),
  'edited body', 'author edits their own note'
);

-- 8) a DIFFERENT agency member cannot edit someone else's note
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000039","role":"authenticated"}';
insert into _t select 8, throws_ok(
  $$ select public.update_internal_note(
       (select id from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039'), 'hijack') $$,
  'P0001'
);

-- 9) …nor delete it
insert into _t select 9, throws_ok(
  $$ select public.delete_internal_note(
       (select id from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039')) $$,
  'P0001'
);

-- 10) the author can delete their own note
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000039","role":"authenticated"}';
select public.delete_internal_note(
  (select id from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039'));
insert into _t select 10, is_empty(
  $$ select 1 from public.internal_note where parent_id='e1000000-0000-0000-0000-000000000039' $$,
  'author deletes their own note'
);

-- ---------- emit ----------
-- Back to the owner so the emit can SELECT _t (authenticated only has INSERT on it).
set local role postgres;
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

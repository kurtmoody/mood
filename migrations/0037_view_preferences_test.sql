-- pgTap test for 0037 — user_view_preference RLS + set_view_preference upsert.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0037.
--
-- Unlike the other suites, this one tests RLS READS, so it must actually become the
-- authenticated role (the owner bypasses RLS). Pattern: grant insert on _t to
-- authenticated and plan() BEFORE switching role; act as authenticated with a
-- request.jwt.claims GUC; drop to role postgres to read true state.

begin;

create extension if not exists pgtap;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000037', 'vp_a@test.local'),
  ('b1000000-0000-0000-0000-000000000037', 'vp_b@test.local');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(5);

-- ===== act as user A =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000037","role":"authenticated"}';

-- 1) A sets a preference and reads it back (own-row read under RLS)
select public.set_view_preference('tasks',
  '[{"key":"title","hidden":false},{"key":"status","hidden":true}]'::jsonb);
insert into _t select 1, is(
  (select config->1->>'hidden' from public.user_view_preference where view_key = 'tasks'),
  'true', 'a user can set and read back their own preference'
);

-- 2) re-setting upserts (replaces, not appends)
select public.set_view_preference('tasks', '[{"key":"title","hidden":false}]'::jsonb);
insert into _t select 2, is(
  (select jsonb_array_length(config) from public.user_view_preference where view_key = 'tasks'),
  1, 're-setting replaces the config (upsert)'
);

-- 3) A cannot see another user's preference (there is none yet, and never will be visible)
--    First B writes one; then we confirm A can't read it. Switch to B to write:
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-000000000037","role":"authenticated"}';
select public.set_view_preference('tasks',
  '[{"key":"title","hidden":false},{"key":"owner","hidden":true}]'::jsonb);

-- back to A: A must NOT see B's row
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000037","role":"authenticated"}';
insert into _t select 3, is_empty(
  $$ select 1 from public.user_view_preference
       where user_id = 'b1000000-0000-0000-0000-000000000037' $$,
  'a user cannot read another user''s preference (RLS)'
);

-- 4) B sees their OWN row for the same view_key (no collision with A's)
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-000000000037","role":"authenticated"}';
insert into _t select 4, is(
  (select config->1->>'key' from public.user_view_preference where view_key = 'tasks'),
  'owner', 'each user has their own row for the same view_key'
);

-- 5) true state: both rows coexist under the same view_key
set local role postgres;
insert into _t select 5, is(
  (select count(*)::int from public.user_view_preference where view_key = 'tasks'),
  2, 'two users'' preferences for the same view_key coexist'
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

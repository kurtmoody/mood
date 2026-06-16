-- pgTap test for 0054 — content_item_channel: backfill, RLS read floor, set_post_channels,
-- and multi-channel create_post. Paste into the Supabase SQL editor and run. Requires 0054.
--
-- Assertion (b) tests RLS READS, so it becomes the authenticated role (owner bypasses RLS):
-- grant insert on _t to authenticated and plan() BEFORE the role switch; drive the caller via
-- the request.jwt.claims GUC. The SECURITY DEFINER RPCs (set_post_channels / create_post) read
-- auth.uid() from the GUC and work the same under the authenticated role. Deterministic
-- true-state reads (counts, channel_id) drop to set local role postgres.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000054', 'pc_agencyA@test.local'),  -- agency A member, the actor
  ('7c000000-0000-0000-0000-000000000054', 'pc_contact@test.local');  -- client-scope (portal) user of C

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000054', 'PC Agency A');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000054', 'a0000000-0000-0000-0000-000000000054', 'PC Client C'),
  ('cb000000-0000-0000-0000-000000000054', 'a0000000-0000-0000-0000-000000000054', 'PC Client D');

insert into public.channel (id, client_id, type, label) values
  ('c1000000-0000-0000-0000-000000000054', 'ca000000-0000-0000-0000-000000000054', 'instagram', 'C IG'),
  ('c2000000-0000-0000-0000-000000000054', 'ca000000-0000-0000-0000-000000000054', 'facebook',  'C FB'),
  ('c3000000-0000-0000-0000-000000000054', 'ca000000-0000-0000-0000-000000000054', 'linkedin',  'C LI'),
  ('cd000000-0000-0000-0000-000000000054', 'cb000000-0000-0000-0000-000000000054', 'instagram', 'D IG'); -- other client

-- An existing single-channel DRAFT post under C (channel_id = c1, no join row yet).
insert into public.content_item (id, client_id, channel_id, title, status) values
  ('e1000000-0000-0000-0000-000000000054', 'ca000000-0000-0000-0000-000000000054',
   'c1000000-0000-0000-0000-000000000054', 'PC Backfill Post', 'draft');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000054', 'agency', 'a0000000-0000-0000-0000-000000000054', 'agency_member'),
  ('7c000000-0000-0000-0000-000000000054', 'client', 'ca000000-0000-0000-0000-000000000054', 'client_approver');

-- Mirror the migration's backfill for the test post (real rows were backfilled at migrate time,
-- but this transactional fixture row was not). Same select/insert as the migration, scoped.
insert into public.content_item_channel (content_item_id, channel_id)
  select id, channel_id from public.content_item
   where channel_id is not null and id = 'e1000000-0000-0000-0000-000000000054'
  on conflict do nothing;

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(9);

-- 1) backfill: the single-channel post has exactly one join row (owner = true state)
insert into _t select 1, is(
  (select count(*)::int from public.content_item_channel where content_item_id = 'e1000000-0000-0000-0000-000000000054'),
  1, 'backfill records exactly one join row for a single-channel post'
);

-- ===== (b) RLS reads — under the authenticated role so the read floor applies =====
set local role authenticated;

-- 2) an agency member can read the draft post's channel links
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000054","role":"authenticated"}';
insert into _t select 2, isnt_empty(
  $$ select 1 from public.content_item_channel where content_item_id='e1000000-0000-0000-0000-000000000054' $$,
  'agency member can read a draft post''s channel links'
);

-- 3) a client user cannot (a draft is below their read floor)
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000054","role":"authenticated"}';
insert into _t select 3, is_empty(
  $$ select 1 from public.content_item_channel where content_item_id='e1000000-0000-0000-0000-000000000054' $$,
  'client user cannot read a draft post''s channel links'
);

-- ===== (c)/(d) RPCs — back to the actor (still authenticated; the RPC reads the GUC) =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000054","role":"authenticated"}';

-- replace the post's channels with {c2, c3}
select public.set_post_channels('e1000000-0000-0000-0000-000000000054',
  array['c2000000-0000-0000-0000-000000000054','c3000000-0000-0000-0000-000000000054']::uuid[]);

-- 4) a channel belonging to a different client is rejected
insert into _t select 4, throws_ok(
  $$ select public.set_post_channels('e1000000-0000-0000-0000-000000000054', array['cd000000-0000-0000-0000-000000000054'::uuid]) $$,
  'P0001'
);

-- create a multi-channel post (no single p_channel_id; array of {c1, c2})
select public.create_post(
  p_client_id  => 'ca000000-0000-0000-0000-000000000054',
  p_title      => 'PC Multi Post',
  p_channel_ids => array['c1000000-0000-0000-0000-000000000054','c2000000-0000-0000-0000-000000000054']::uuid[]
);

-- ===== true-state reads (owner) =====
set local role postgres;

-- 5) set_post_channels replaced the set (exactly two rows now)
insert into _t select 5, is(
  (select count(*)::int from public.content_item_channel where content_item_id='e1000000-0000-0000-0000-000000000054'),
  2, 'set_post_channels replaces the join set with exactly the given channels'
);

-- 6) channel_id was updated to the first id in the array (c2)
insert into _t select 6, is(
  (select channel_id from public.content_item where id='e1000000-0000-0000-0000-000000000054'),
  'c2000000-0000-0000-0000-000000000054'::uuid, 'set_post_channels sets channel_id to the first channel'
);

-- 7) the previous channel link (c1) is gone
insert into _t select 7, is_empty(
  $$ select 1 from public.content_item_channel
      where content_item_id='e1000000-0000-0000-0000-000000000054' and channel_id='c1000000-0000-0000-0000-000000000054' $$,
  'set_post_channels removed the previous channel link'
);

-- 8) create_post wrote a join row for every channel in the array (two)
insert into _t select 8, is(
  (select count(*)::int from public.content_item_channel
     where content_item_id = (select id from public.content_item where title='PC Multi Post')),
  2, 'create_post writes a join row for every channel in the array'
);

-- 9) create_post set channel_id to the first channel in the array (c1)
insert into _t select 9, is(
  (select channel_id from public.content_item where title='PC Multi Post'),
  'c1000000-0000-0000-0000-000000000054'::uuid, 'create_post sets channel_id to the first channel'
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

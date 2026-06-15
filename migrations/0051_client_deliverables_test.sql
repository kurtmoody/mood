-- pgTap test for 0051 — client_deliverable RLS (agency-only read) + RPC auth.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0051.
--
-- This tests RLS READS, so it becomes the authenticated role (owner bypasses RLS):
-- grant insert on _t to authenticated and plan() BEFORE the role switch; drive the
-- caller via the request.jwt.claims GUC. RPCs are SECURITY DEFINER and read auth.uid()
-- from the GUC, so they work the same under the authenticated role. True-state reads
-- (verifying a row regardless of RLS) drop to set local role postgres.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000051', 'cd_agA@test.local'),    -- agency A member
  ('8b000000-0000-0000-0000-000000000051', 'cd_agB@test.local'),    -- agency B member (cross-tenant)
  ('7c000000-0000-0000-0000-000000000051', 'cd_client@test.local'); -- client-scope user of A's client

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000051', 'CD Agency A'),
  ('b0000000-0000-0000-0000-000000000051', 'CD Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000051', 'CD Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000051', 'agency', 'a0000000-0000-0000-0000-000000000051', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000051', 'agency', 'b0000000-0000-0000-0000-000000000051', 'agency_member'),
  ('7c000000-0000-0000-0000-000000000051', 'client', 'ca000000-0000-0000-0000-000000000051', 'client_approver');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(11);

-- ===== agency A member: mutations =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- 1) add returns a uuid
insert into _t select 1, ok(
  (select public.add_client_deliverable(
     'ca000000-0000-0000-0000-000000000051', 'Instagram posts', 12, 'per_month', 'grid + stories')) is not null,
  'agency member adds a deliverable, uuid returned'
);

-- a second one, so reorder has two rows (sort_order 0 then 1)
select public.add_client_deliverable('ca000000-0000-0000-0000-000000000051', 'Community management', null, 'ongoing', null);

-- 2) the agency-A member can read their own client's deliverables under RLS
insert into _t select 2, is(
  (select count(*)::int from public.client_deliverable
     where client_id='ca000000-0000-0000-0000-000000000051'),
  2, 'agency member reads their own deliverables under RLS'
);

-- update the first
select public.update_client_deliverable(
  (select id from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram posts'),
  'Instagram grid posts', 24, 'per_month', 'updated');

-- reorder: put Community management first → Instagram grid posts moves 0 → 1
select public.reorder_client_deliverable('ca000000-0000-0000-0000-000000000051', array[
  (select id from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Community management'),
  (select id from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram grid posts')
]::uuid[]);

-- ===== true-state reads (bypass RLS) =====
set local role postgres;

-- 3) the added deliverable persisted with its cadence
insert into _t select 3, is(
  (select cadence from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram grid posts'),
  'per_month', 'added deliverable persisted'
);

-- 4) update changed the fields
insert into _t select 4, is(
  (select quantity from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram grid posts'),
  24::numeric, 'agency member updates a deliverable'
);

-- 5) update stamped updated_at
insert into _t select 5, ok(
  (select updated_at is not null from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram grid posts'),
  'update stamps updated_at'
);

-- 6) reorder reindexed sort_order (Instagram grid posts went 0 → 1)
insert into _t select 6, is(
  (select sort_order from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' and label='Instagram grid posts'),
  1, 'reorder sets sort_order to the array index'
);

-- ===== cross-tenant agency B member =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- 7) cannot add to agency A's client
insert into _t select 7, throws_ok(
  $$ select public.add_client_deliverable('ca000000-0000-0000-0000-000000000051', 'Sneaky', 1, 'per_week', null) $$,
  'P0001'
);

-- 8) cannot update agency A's deliverable
insert into _t select 8, throws_ok(
  $$ select public.update_client_deliverable(
       (select id from public.client_deliverable where label='Instagram grid posts'), 'Hijack', 1, 'per_week', null) $$,
  'P0001'
);

-- 9) cannot READ agency A's deliverables (RLS, no cross-tenant path)
insert into _t select 9, is_empty(
  $$ select 1 from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' $$,
  'cross-tenant agency cannot read the deliverables'
);

-- ===== agency A member: validation =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- 10) invalid cadence is rejected
insert into _t select 10, throws_ok(
  $$ select public.add_client_deliverable('ca000000-0000-0000-0000-000000000051', 'Bad cadence', 1, 'fortnightly', null) $$,
  'P0001'
);

-- ===== client-scope user =====
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000051","role":"authenticated"}';

-- 11) a client-scope user cannot read the deliverables (no portal path)
insert into _t select 11, is_empty(
  $$ select 1 from public.client_deliverable where client_id='ca000000-0000-0000-0000-000000000051' $$,
  'client-scope user cannot read the deliverables'
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

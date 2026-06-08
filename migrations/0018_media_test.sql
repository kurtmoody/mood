-- pgTap test for 0018 — media RPC authorisation + table RLS. Paste into the
-- Supabase SQL editor and run. No basejump; only pgtap. Wrapped in begin; … rollback;.
-- Requires 0018_media.sql applied first.
--
-- Proven hosted pattern (as per the 0015/0016/0017 tests):
--  * Fixtures, the _t results table, `grant insert on _t to authenticated`, and
--    plan() all happen BEFORE any role switch (as the owner).
--  * We act AS a user via `set local role authenticated` + a jwt-claims GUC, switch
--    users by re-setting the claim, and drop to `set local role postgres` (NOT reset
--    role) to read true state.
--  * throws_ok 2-arg (sql, 'P0001') for RAISE EXCEPTION; is_empty/isnt_empty for the
--    silent RLS reads. All TAP lines aggregated via union all.
--
-- Covers the media TABLE policies + RPCs AND the storage.objects SELECT policy
-- (status-gated via path segment 2). Storage fixtures are inserted as the agency
-- user so they pass the agency-only INSERT policy; the DELETE policy is not tested.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner; RLS bypassed) ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000018', 'media_agency@test.local'),
  ('60000000-0000-0000-0000-000000000018', 'media_client@test.local');

insert into public.agency (id, name)
values ('a0000000-0000-0000-0000-000000000018', 'Media Test Agency');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000018', 'Media Client A'),
  ('c2000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000018', 'Media Client B');

-- An agency_admin (Agency) and a client_approver (Client A only).
insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000018', 'agency', 'a0000000-0000-0000-0000-000000000018', 'agency_admin'),
  ('60000000-0000-0000-0000-000000000018', 'client', 'c1000000-0000-0000-0000-000000000018', 'client_approver');

-- Posts: Client A client_review + draft, Client B client_review. Each with a version.
insert into public.content_item (id, client_id, status, title) values
  ('11000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000018', 'client_review', 'A cr'),
  ('11000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000018', 'draft',         'A draft'),
  ('22000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000018', 'client_review', 'B cr');

insert into public.content_version (id, content_item_id, version_no) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 1),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 1),
  ('32000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000003', 1);

-- Pre-existing media rows: on A's client_review version (visible), A's draft version
-- (hidden), and B's client_review version (cross-tenant).
insert into public.media (id, version_id, storage_path) values
  ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'a-cr-media'),
  ('41000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'a-draft-media'),
  ('42000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000003', 'b-cr-media');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;

select plan(8);

set local role authenticated;

-- ---------- as the AGENCY user ----------
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000018","role":"authenticated"}';

-- Happy path: agency adds media for their client's version (asserted on state below).
select public.add_media('31000000-0000-0000-0000-000000000001', 'a-cr-agency-upload', 'image/png', 1234);

-- Storage fixtures, inserted as the agency user so they pass the agency-only INSERT
-- policy. Paths follow <client_id>/<content_item_id>/<version_id>/<filename>, so the
-- SELECT policy resolves the parent post (and its status) from path segment 2.
insert into storage.objects (bucket_id, name) values
  ('content-media', 'c1000000-0000-0000-0000-000000000018/11000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/cr.png'),
  ('content-media', 'c1000000-0000-0000-0000-000000000018/11000000-0000-0000-0000-000000000002/31000000-0000-0000-0000-000000000002/draft.png'),
  ('content-media', 'c2000000-0000-0000-0000-000000000018/22000000-0000-0000-0000-000000000003/32000000-0000-0000-0000-000000000003/b.png');

-- ---------- as the CLIENT user ----------
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000018","role":"authenticated"}';

-- 2) client cannot add_media (agency-only) → raises P0001.
insert into _t select 2, throws_ok(
  $$ select public.add_media('31000000-0000-0000-0000-000000000001', 'a-cr-client-attempt', 'image/png', 1) $$,
  'P0001'
);

-- 3) client CAN see media on a client_review post (silent RLS read).
insert into _t select 3, isnt_empty(
  $$ select id from public.media where id = '41000000-0000-0000-0000-000000000001' $$,
  'client sees media on a client_review post'
);

-- 4) client CANNOT see media on a draft post (inherits the status gate).
insert into _t select 4, is_empty(
  $$ select id from public.media where id = '41000000-0000-0000-0000-000000000002' $$,
  'client cannot see media on a draft post'
);

-- 5) client CANNOT see another client's media (cross-tenant).
insert into _t select 5, is_empty(
  $$ select id from public.media where id = '42000000-0000-0000-0000-000000000003' $$,
  'client cannot see another client''s media'
);

-- ----- storage.objects layer (status-gated SELECT policy, segment 2) -----
-- 6) client CAN see the storage object for a client_review post.
insert into _t select 6, isnt_empty(
  $$ select name from storage.objects
       where name = 'c1000000-0000-0000-0000-000000000018/11000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/cr.png' $$,
  'client sees the storage object for a client_review post'
);

-- 7) client CANNOT see the storage object for a DRAFT post (status gate at the storage layer).
insert into _t select 7, is_empty(
  $$ select name from storage.objects
       where name = 'c1000000-0000-0000-0000-000000000018/11000000-0000-0000-0000-000000000002/31000000-0000-0000-0000-000000000002/draft.png' $$,
  'client cannot see the storage object for a draft post'
);

-- 8) client CANNOT see another client's storage object (cross-tenant).
insert into _t select 8, is_empty(
  $$ select name from storage.objects
       where name = 'c2000000-0000-0000-0000-000000000018/22000000-0000-0000-0000-000000000003/32000000-0000-0000-0000-000000000003/b.png' $$,
  'client cannot see another client''s storage object'
);

-- ---------- as the owner: verify the agency upload created a row ----------
set local role postgres;

insert into _t select 1, isnt_empty(
  $$ select id from public.media where storage_path = 'a-cr-agency-upload' $$,
  'agency add_media created a media row'
);

-- ---------- emit every TAP line (plus the pgTap footer) ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

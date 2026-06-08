-- pgTap test for 0021 — snapshot-on-send versioning. Paste into the Supabase SQL
-- editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0021_versioning.sql applied first.
--
-- Proven hosted pattern: temp _t + grant + plan() before any role switch; act via
-- `set local role authenticated` + a jwt-claims GUC; `set local role postgres` to
-- read true state; aggregate via union all. pgTap runs only as the owner; the RPC
-- calls run as the agency user. The fork's storage.copy is app-layer and not tested
-- here — we assert the DB-side fork (media table rows at the new path).

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner) ----------
insert into auth.users (id, email) values ('70000000-0000-0000-0000-000000000021', 'version_agency@test.local');

insert into public.agency (id, name) values ('a0000000-0000-0000-0000-000000000021', 'Versioning Test Agency');
insert into public.client (id, agency_id, name) values ('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000021', 'Versioning Client');
insert into public.membership (user_id, scope_type, scope_id, role)
values ('70000000-0000-0000-0000-000000000021', 'agency', 'a0000000-0000-0000-0000-000000000021', 'agency_admin');

-- A draft post and a client_review post, each with a v1.
insert into public.content_item (id, client_id, status, title) values
  ('11000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000021', 'draft',         'Draft post'),
  ('11000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000021', 'client_review', 'CR post');

insert into public.content_version (id, content_item_id, version_no, body) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 1, 'draft v1 body'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 1, 'cr v1 body');

update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000001' where id = '11000000-0000-0000-0000-000000000001';
update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000002' where id = '11000000-0000-0000-0000-000000000002';

-- One media row on the CR post's v1 (to be copied forward on fork).
insert into public.media (id, version_id, storage_path, mime_type) values
  ('41000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000021/11000000-0000-0000-0000-000000000002/31000000-0000-0000-0000-000000000002/photo.png', 'image/png');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;

select plan(6);

-- ---------- edit both posts as the agency user ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000021","role":"authenticated"}';
select public.update_post('11000000-0000-0000-0000-000000000001', null, null, null, 'draft edited');  -- mutable: in place
select public.update_post('11000000-0000-0000-0000-000000000002', null, null, null, 'cr v2 body');    -- frozen: fork

-- ---------- read post-fork state as the owner ----------
set local role postgres;

-- 1) editing a draft adds no new version.
insert into _t select 1, is(
  (select count(*) from public.content_version where content_item_id = '11000000-0000-0000-0000-000000000001')::text,
  '1',
  'editing a draft updates in place — no new version'
);

-- 2) editing a client_review post forks v2 (version_no=2), repoints current_version_id, bounces to internal_review.
insert into _t select 2, isnt_empty(
  $$ select 1 from public.content_item ci
       join public.content_version cv on cv.id = ci.current_version_id
      where ci.id = '11000000-0000-0000-0000-000000000002'
        and cv.version_no = 2
        and ci.status = 'internal_review' $$,
  'fork: v2 created, current_version_id repointed, status bounced to internal_review'
);

-- 3) v1 is unchanged — immutable snapshot.
insert into _t select 3, is(
  (select body from public.content_version where content_item_id = '11000000-0000-0000-0000-000000000002' and version_no = 1),
  'cr v1 body',
  'v1 body is unchanged (immutable snapshot)'
);

-- 4) uq_version_no rejects a duplicate (content_item_id, version_no).
insert into _t select 4, throws_ok(
  $$ insert into public.content_version (content_item_id, version_no, body)
       values ('11000000-0000-0000-0000-000000000002', 1, 'dup') $$,
  '23505'
);

-- 6) media was copied to v2 at a NEW path under the v2 folder.
insert into _t select 6, isnt_empty(
  $$ select 1 from public.media m
       join public.content_version cv on cv.id = m.version_id
      where cv.content_item_id = '11000000-0000-0000-0000-000000000002'
        and cv.version_no = 2
        and m.storage_path like '%/' || cv.id::text || '/%' $$,
  'media copied to v2 at a new path under the v2 folder'
);

-- ---------- approve the forked post; confirm the event records v2 ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000021","role":"authenticated"}';
select public.transition_post('11000000-0000-0000-0000-000000000002', 'approve_internal'); -- internal_review → client_review

set local role postgres;

-- 5) the approval event records the current (v2) version_id.
insert into _t select 5, isnt_empty(
  $$ select 1 from public.approval_event ae
      where ae.content_item_id = '11000000-0000-0000-0000-000000000002'
        and ae.action = 'approve_internal'
        and ae.version_id = (select id from public.content_version
                              where content_item_id = '11000000-0000-0000-0000-000000000002' and version_no = 2) $$,
  'approval event records the current (v2) version_id'
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

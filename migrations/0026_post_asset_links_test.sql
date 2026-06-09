-- pgTap test for 0026 — post_asset_link read floor + RPC authorisation. Paste into the
-- Supabase SQL editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0015 helpers (is_agency_for_client / is_client_user / client_ids_for_user)
-- and 0026 applied.
--
-- This table is RLS-read-gated, so reads run as `set local role authenticated` + a
-- jwt-claims GUC (to exercise RLS); the SECURITY DEFINER RPCs work under the same.
-- temp _t + grant + plan() BEFORE any role switch; drop to postgres to read true state.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (owner) ----------
insert into auth.users (id, email) values
  ('7a000000-0000-0000-0000-000000000026', 'al_agency@test.local'),   -- agency a
  ('6c000000-0000-0000-0000-000000000026', 'al_client@test.local'),   -- client of C
  ('8b000000-0000-0000-0000-000000000026', 'al_other@test.local');    -- agency b (cross-tenant)

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000026', 'AL Agency A'),
  ('b0000000-0000-0000-0000-000000000026', 'AL Agency B');
insert into public.client (id, agency_id, name) values
  ('c0000000-0000-0000-0000-000000000026', 'a0000000-0000-0000-0000-000000000026', 'AL Client C');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('7a000000-0000-0000-0000-000000000026', 'agency', 'a0000000-0000-0000-0000-000000000026', 'agency_admin'),
  ('6c000000-0000-0000-0000-000000000026', 'client', 'c0000000-0000-0000-0000-000000000026', 'client_approver'),
  ('8b000000-0000-0000-0000-000000000026', 'agency', 'b0000000-0000-0000-0000-000000000026', 'agency_admin');

-- A client_review post (client-visible) and an internal_review post (not).
insert into public.content_item (id, client_id, status, title) values
  ('11000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000026', 'client_review',   'CR post'),
  ('11000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000026', 'internal_review', 'IR post');

-- Fixture links: two on the CR post (to reorder), one on the IR post.
insert into public.post_asset_link (id, content_item_id, label, url, sort_order) values
  ('41000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'Drive folder', 'https://drive.example/cr-a', 0),
  ('41000000-0000-0000-0000-00000000000b', '11000000-0000-0000-0000-000000000001', 'Raw footage',  'https://drive.example/cr-b', 1),
  ('41000000-0000-0000-0000-00000000000c', '11000000-0000-0000-0000-000000000002', 'Raw footage',  'https://drive.example/ir',   0);

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(8);

-- ===== agency A: write (add) + reorder =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000026","role":"authenticated"}';
select public.add_asset_link('11000000-0000-0000-0000-000000000001', 'Final exports', 'https://added.example');
select public.reorder_asset_link('11000000-0000-0000-0000-000000000001',
  ARRAY['41000000-0000-0000-0000-00000000000b','41000000-0000-0000-0000-00000000000a']::uuid[]); -- b,a

-- 1) agency adds a link and can read it (RLS agency branch).
insert into _t select 1, isnt_empty(
  $$ select 1 from public.post_asset_link where content_item_id='11000000-0000-0000-0000-000000000001' and url='https://added.example' $$,
  'agency adds and reads a post link'
);

-- read true state for the reorder
set local role postgres;
-- 2) reorder set sort_order to the passed order (b, a).
insert into _t select 2, is(
  (select array_agg(id order by sort_order) from public.post_asset_link
     where content_item_id='11000000-0000-0000-0000-000000000001'
       and id in ('41000000-0000-0000-0000-00000000000a','41000000-0000-0000-0000-00000000000b'))::text,
  (ARRAY['41000000-0000-0000-0000-00000000000b','41000000-0000-0000-0000-00000000000a']::uuid[])::text,
  'agency reorder sets sort_order to the passed order'
);

-- ===== client CU: read floor + no writes =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"6c000000-0000-0000-0000-000000000026","role":"authenticated"}';
-- 3) client reads links on a client_review post.
insert into _t select 3, isnt_empty(
  $$ select 1 from public.post_asset_link where content_item_id='11000000-0000-0000-0000-000000000001' $$,
  'client reads links on a client_review post'
);
-- 4) client cannot read links on an internal_review post.
insert into _t select 4, is_empty(
  $$ select 1 from public.post_asset_link where content_item_id='11000000-0000-0000-0000-000000000002' $$,
  'client cannot read links on an internal_review post'
);
-- 5) client cannot add.
insert into _t select 5, throws_ok(
  $$ select public.add_asset_link('11000000-0000-0000-0000-000000000001', 'x', 'https://x.example') $$, 'P0001'
);
-- 6) client cannot reorder.
insert into _t select 6, throws_ok(
  $$ select public.reorder_asset_link('11000000-0000-0000-0000-000000000001', ARRAY['41000000-0000-0000-0000-00000000000a']::uuid[]) $$, 'P0001'
);

-- ===== cross-tenant agency B =====
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000026","role":"authenticated"}';
-- 7) another agency cannot add to this client's post.
insert into _t select 7, throws_ok(
  $$ select public.add_asset_link('11000000-0000-0000-0000-000000000001', 'x', 'https://x.example') $$, 'P0001'
);
-- 8) another agency cannot read this client's links.
insert into _t select 8, is_empty(
  $$ select 1 from public.post_asset_link where content_item_id='11000000-0000-0000-0000-000000000001' $$,
  'cross-tenant agency cannot read another client''s links'
);

-- ---------- emit ----------
set local role postgres;
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

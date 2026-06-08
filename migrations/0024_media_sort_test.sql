-- pgTap test for 0024 — media ordering. Paste into the Supabase SQL editor and run.
-- No basejump; only pgtap. begin; … rollback;. Requires 0019–0024 applied.
--
-- reorder_media / update_post key off auth.uid(), so we drive the caller via the
-- request.jwt.claims GUC; pgTap and the SECURITY DEFINER functions run as the owner.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000024', 'sort_agency@test.local'),  -- agency 1
  ('60000000-0000-0000-0000-000000000024', 'sort_client@test.local');  -- client of A

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000024', 'Sort Agency 1'),
  ('b0000000-0000-0000-0000-000000000024', 'Sort Agency 2');
insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000024', 'Client A'),  -- agency 1
  ('c3000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000024', 'Client C');  -- agency 2

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000024', 'agency', 'a0000000-0000-0000-0000-000000000024', 'agency_admin'),
  ('60000000-0000-0000-0000-000000000024', 'client', 'c1000000-0000-0000-0000-000000000024', 'client_approver');

-- P1 (client A): version with 3 media a,b,c at sort_order 0,1,2 — to reorder.
insert into public.content_item (id, client_id, status, title) values ('11000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000024', 'draft', 'Reorder post');
insert into public.content_version (id, content_item_id, version_no) values ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 1);
update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000001' where id = '11000000-0000-0000-0000-000000000001';
insert into public.media (id, version_id, storage_path, mime_type, sort_order) values
  ('41000000-0000-0000-0000-00000000000a', '31000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000024/11000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/a.png', 'image/png', 0),
  ('41000000-0000-0000-0000-00000000000b', '31000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000024/11000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/b.png', 'image/png', 1),
  ('41000000-0000-0000-0000-00000000000c', '31000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000024/11000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/c.png', 'image/png', 2);

-- P2 (client A, client_review): media beta(0), alpha(1) — to fork and check order carries.
insert into public.content_item (id, client_id, status, title) values ('11000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000024', 'client_review', 'Fork post');
insert into public.content_version (id, content_item_id, version_no) values ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 1);
update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000002' where id = '11000000-0000-0000-0000-000000000002';
insert into public.media (id, version_id, storage_path, mime_type, sort_order) values
  ('42000000-0000-0000-0000-00000000000a', '31000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000024/11000000-0000-0000-0000-000000000002/31000000-0000-0000-0000-000000000002/alpha.png', 'image/png', 1),
  ('42000000-0000-0000-0000-00000000000b', '31000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000024/11000000-0000-0000-0000-000000000002/31000000-0000-0000-0000-000000000002/beta.png', 'image/png', 0);

-- P3 (client C — another agency): a version, for the cross-agency reorder test.
insert into public.content_item (id, client_id, status, title) values ('11000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000024', 'draft', 'Other agency post');
insert into public.content_version (id, content_item_id, version_no) values ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003', 1);
update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000003' where id = '11000000-0000-0000-0000-000000000003';

create temp table _t (seq int, line text);
select plan(4);

-- ---------- actions as the agency user ----------
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000024","role":"authenticated"}';
select public.reorder_media('31000000-0000-0000-0000-000000000001',
  ARRAY['41000000-0000-0000-0000-00000000000c','41000000-0000-0000-0000-00000000000a','41000000-0000-0000-0000-00000000000b']::uuid[]); -- c,a,b
select public.update_post('11000000-0000-0000-0000-000000000002', null, null, null, 'v2 body'); -- fork

-- 1) reorder sets sort_order to the array order (c,a,b).
insert into _t select 1, is(
  (select array_agg(id order by sort_order) from public.media where version_id = '31000000-0000-0000-0000-000000000001')::text,
  (ARRAY['41000000-0000-0000-0000-00000000000c','41000000-0000-0000-0000-00000000000a','41000000-0000-0000-0000-00000000000b']::uuid[])::text,
  'agency reorder sets sort_order to the passed array order'
);

-- 2) fork preserves order: v2 media by sort_order = beta, alpha (as on v1).
insert into _t select 2, is(
  (select array_agg(substring(storage_path from '[^/]+$') order by sort_order)
     from public.media m join public.content_version cv on cv.id = m.version_id
    where cv.content_item_id = '11000000-0000-0000-0000-000000000002' and cv.version_no = 2)::text,
  (ARRAY['beta.png','alpha.png'])::text,
  'fork carries media sort_order forward to v2'
);

-- 3) a client cannot reorder (agency-only).
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000024","role":"authenticated"}';
insert into _t select 3, throws_ok(
  $$ select public.reorder_media('31000000-0000-0000-0000-000000000001', ARRAY['41000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  'P0001'
);

-- 4) an agency user cannot reorder another agency's client's version.
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000024","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.reorder_media('31000000-0000-0000-0000-000000000003', ARRAY['00000000-0000-0000-0000-000000000000']::uuid[]) $$,
  'P0001'
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

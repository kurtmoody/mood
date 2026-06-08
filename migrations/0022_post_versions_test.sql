-- pgTap test for 0022 — get_post_versions role filter. Paste into the Supabase SQL
-- editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0022_post_versions.sql applied first.
--
-- get_post_versions keys off auth.uid() only (it's SECURITY DEFINER and does its own
-- authorisation), so we drive the caller purely via the request.jwt.claims GUC, which
-- auth.uid() reads. pgTap and the function both run as the owner — no role switch or
-- _t grant is needed; _t only aggregates the TAP lines for the hosted editor.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000022', 'gpv_agency@test.local'),
  ('60000000-0000-0000-0000-000000000022', 'gpv_client@test.local'),
  ('80000000-0000-0000-0000-000000000022', 'gpv_outsider@test.local');

insert into public.agency (id, name) values ('a0000000-0000-0000-0000-000000000022', 'GPV Agency');
insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000022', 'GPV Client A'),
  ('c2000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000022', 'GPV Client B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('70000000-0000-0000-0000-000000000022', 'agency', 'a0000000-0000-0000-0000-000000000022', 'agency_admin'),
  ('60000000-0000-0000-0000-000000000022', 'client', 'c1000000-0000-0000-0000-000000000022', 'client_approver');
-- 80…22 is an outsider: no membership.

-- Post P (client A): forked to v2, currently internal_review (the revised-post case).
-- v1 WAS sent (approve_internal); v2 has NO approve_internal (a purely-internal draft).
insert into public.content_item (id, client_id, status, title)
values ('11000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000022', 'internal_review', 'Revised post');

insert into public.content_version (id, content_item_id, version_no, body, internal_note) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 1, 'v1 sent body',  'v1 internal secret'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 2, 'v2 draft body', 'v2 internal secret');
update public.content_item set current_version_id = '31000000-0000-0000-0000-000000000002'
 where id = '11000000-0000-0000-0000-000000000001';

insert into public.approval_event (content_item_id, version_id, actor_id, action) values
  ('11000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000022', 'approve_internal');

-- Post in client B (for the cross-client authorisation test).
insert into public.content_item (id, client_id, status, title)
values ('12000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000022', 'client_review', 'Client B post');
insert into public.content_version (id, content_item_id, version_no, body)
values ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 1, 'b1 body');
update public.content_item set current_version_id = '32000000-0000-0000-0000-000000000001'
 where id = '12000000-0000-0000-0000-000000000001';

create temp table _t (seq int, line text);
select plan(6);

-- 1) agency sees ALL versions of the post (v1 + v2).
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000022","role":"authenticated"}';
insert into _t select 1, is(
  (select count(*) from public.get_post_versions('11000000-0000-0000-0000-000000000001'))::text,
  '2',
  'agency sees all versions'
);

-- 2) KEY: client sees the previously-sent v1 even though the post is now internal_review.
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000022","role":"authenticated"}';
insert into _t select 2, isnt_empty(
  $$ select 1 from public.get_post_versions('11000000-0000-0000-0000-000000000001') where version_no = 1 $$,
  'client sees a previously-sent v1 after the post was revised back to internal_review'
);

-- 3) KEY leak-prevention: client does NOT see v2 (no approve_internal — internal-only draft).
insert into _t select 3, is_empty(
  $$ select 1 from public.get_post_versions('11000000-0000-0000-0000-000000000001') where version_no = 2 $$,
  'client does NOT see an internal-only draft version (no approve_internal)'
);

-- 4) client never receives internal_note (nulled on every returned row).
insert into _t select 4, is_empty(
  $$ select 1 from public.get_post_versions('11000000-0000-0000-0000-000000000001') where internal_note is not null $$,
  'internal_note is nulled for client callers'
);

-- 5) an outsider (neither agency nor client of this client) is rejected.
set local request.jwt.claims = '{"sub":"80000000-0000-0000-0000-000000000022","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select * from public.get_post_versions('11000000-0000-0000-0000-000000000001') $$,
  'P0001'
);

-- 6) a client of A calling it for another client's (B's) post is rejected.
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000022","role":"authenticated"}';
insert into _t select 6, throws_ok(
  $$ select * from public.get_post_versions('12000000-0000-0000-0000-000000000001') $$,
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

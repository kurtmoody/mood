-- pgTap test for 0036 — delete_client (guarded cascade) authorisation + cascade.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0036.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state). The fixtures wire
-- up content_item.current_version_id and approval_event.version_id (both NO ACTION FKs
-- into content_version) so the cascade is exercised against the references that could block.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000036', 'dc_adminA@test.local'),
  ('8b000000-0000-0000-0000-000000000036', 'dc_adminB@test.local'),
  ('7c000000-0000-0000-0000-000000000036', 'dc_member@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000036', 'DC Agency A'),
  ('b0000000-0000-0000-0000-000000000036', 'DC Agency B');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000036', 'agency', 'a0000000-0000-0000-0000-000000000036', 'agency_admin'),
  ('8b000000-0000-0000-0000-000000000036', 'agency', 'b0000000-0000-0000-0000-000000000036', 'agency_admin'),
  ('7c000000-0000-0000-0000-000000000036', 'agency', 'a0000000-0000-0000-0000-000000000036', 'agency_member');

-- C_arch is archived (deletable); C_active is active (must be refused).
insert into public.client (id, agency_id, name, status) values
  ('c1000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Archived Client', 'archived'),
  ('c2000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'Active Client', 'active');

-- Content under C_arch: item → version (made current) → approval_event + comment; plus a task.
insert into public.content_item (id, client_id, title, status) values
  ('ce000000-0000-0000-0000-000000000036', 'c1000000-0000-0000-0000-000000000036', 'Post', 'draft');
insert into public.content_version (id, content_item_id, version_no, body) values
  ('cf000000-0000-0000-0000-000000000036', 'ce000000-0000-0000-0000-000000000036', 1, 'hello');
update public.content_item set current_version_id = 'cf000000-0000-0000-0000-000000000036'
  where id = 'ce000000-0000-0000-0000-000000000036';
insert into public.approval_event (id, content_item_id, version_id, action) values
  ('ad000000-0000-0000-0000-000000000036', 'ce000000-0000-0000-0000-000000000036', 'cf000000-0000-0000-0000-000000000036', 'submitted_internal');
insert into public.comment (id, content_item_id, version_id, body) values
  ('bd000000-0000-0000-0000-000000000036', 'ce000000-0000-0000-0000-000000000036', 'cf000000-0000-0000-0000-000000000036', 'a comment');
insert into public.task (id, agency_id, client_id, title) values
  ('81000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000036', 'c1000000-0000-0000-0000-000000000036', 'C_arch task');

create temp table _t (seq int, line text);
select plan(7);

-- ===== failures (run BEFORE the happy-path delete of C_arch) =====

-- 5) cannot delete an ACTIVE client
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.delete_client('c2000000-0000-0000-0000-000000000036') $$, 'P0001'
);

-- 6) a non-admin agency member cannot delete
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 6, throws_ok(
  $$ select public.delete_client('c1000000-0000-0000-0000-000000000036') $$, 'P0001'
);

-- 7) an admin of another agency cannot delete
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000036","role":"authenticated"}';
insert into _t select 7, throws_ok(
  $$ select public.delete_client('c1000000-0000-0000-0000-000000000036') $$, 'P0001'
);

-- ===== happy path: admin deletes the archived client =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000036","role":"authenticated"}';
select public.delete_client('c1000000-0000-0000-0000-000000000036');

-- 1) content_item gone
insert into _t select 1, is(
  (select count(*)::int from public.content_item where client_id = 'c1000000-0000-0000-0000-000000000036'),
  0, 'content_item cascade-deleted with the client'
);

-- 2) content_version gone
insert into _t select 2, is(
  (select count(*)::int from public.content_version where content_item_id = 'ce000000-0000-0000-0000-000000000036'),
  0, 'content_version cascade-deleted'
);

-- 3) approval_event gone (exercises the NO ACTION version_id FK in the cascade)
insert into _t select 3, is(
  (select count(*)::int from public.approval_event where content_item_id = 'ce000000-0000-0000-0000-000000000036'),
  0, 'approval_event cascade-deleted'
);

-- 4) task gone (explicit delete — task.client_id is SET NULL, would otherwise orphan)
insert into _t select 4, is(
  (select count(*)::int from public.task where client_id = 'c1000000-0000-0000-0000-000000000036'),
  0, 'task removed with the client'
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

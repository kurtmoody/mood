-- pgTap test for 0042 — set_post_meta persists production fields, no fork, cross-tenant guard.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0042.
--
-- set_post_meta is SECURITY DEFINER (reads auth.uid() from the request.jwt.claims GUC);
-- we stay as the owner and vary the GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000042', 'pm_agencyA@test.local'),
  ('8b000000-0000-0000-0000-000000000042', 'pm_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000042', 'PM Agency A'),
  ('b0000000-0000-0000-0000-000000000042', 'PM Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000042', 'PM Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000042', 'agency', 'a0000000-0000-0000-0000-000000000042', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000042', 'agency', 'b0000000-0000-0000-0000-000000000042', 'agency_member');

-- A DIRECTORY-ONLY designer: no user_id (no login) — proves login-less designers work.
insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d9000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000042', 'Design Intern', null, true);

-- An APPROVED post with one version — the case where update_post would fork. set_post_meta
-- must not: the version count and status must be untouched.
insert into public.content_item (id, client_id, title, status) values
  ('e1000000-0000-0000-0000-000000000042', 'ca000000-0000-0000-0000-000000000042', 'PM Post', 'approved');
insert into public.content_version (id, content_item_id, version_no, body) values
  ('cf000000-0000-0000-0000-000000000042', 'e1000000-0000-0000-0000-000000000042', 1, 'body');
update public.content_item set current_version_id = 'cf000000-0000-0000-0000-000000000042'
  where id = 'e1000000-0000-0000-0000-000000000042';

create temp table _t (seq int, line text);
select plan(9);

-- ===== agency A member sets the metadata =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000042","role":"authenticated"}';
select public.set_post_meta(
  'e1000000-0000-0000-0000-000000000042',
  'd9000000-0000-0000-0000-000000000042',           -- designer_id (directory-only, no login)
  'In progress', 'https://drive.example/x', 'https://drive.example/hi',
  true, 500, '2026-06-01', 'https://instagram.com/p/live');

-- 1-3) simple fields persist
insert into _t select 1, is(
  (select design_status from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  'In progress', 'design_status persists');
insert into _t select 2, is(
  (select boost from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  true, 'boost persists');
insert into _t select 3, is(
  (select ad_budget from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  500::numeric, 'ad_budget persists');

-- 4) designer_id persists — a login-less directory member
insert into _t select 4, is(
  (select designer_id from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  'd9000000-0000-0000-0000-000000000042'::uuid, 'designer_id persists (directory-only, no login)');

-- 5) drive / high-res / date_posted persist
insert into _t select 5, is(
  (select drive_url || '|' || high_res_url || '|' || date_posted::text from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  'https://drive.example/x|https://drive.example/hi|2026-06-01', 'drive/high-res/date_posted persist');

-- 6) posted_url (proof link) persists
insert into _t select 6, is(
  (select posted_url from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  'https://instagram.com/p/live', 'posted_url persists');

-- 7-8) NO version fork, NO status change
insert into _t select 7, is(
  (select count(*)::int from public.content_version where content_item_id='e1000000-0000-0000-0000-000000000042'),
  1, 'set_post_meta does not fork a version');
insert into _t select 8, is(
  (select status::text from public.content_item where id='e1000000-0000-0000-0000-000000000042'),
  'approved', 'set_post_meta does not change the approval status');

-- 9) cross-tenant agency cannot set
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000042","role":"authenticated"}';
insert into _t select 9, throws_ok(
  $$ select public.set_post_meta('e1000000-0000-0000-0000-000000000042', null, 'hack', null, null, false, null, null, null) $$,
  'P0001');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

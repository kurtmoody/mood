-- pgTap test for 0059 — campaign templates: CRUD persistence, offset validation, and the spawn
-- centrepiece (right count, offset dates, dateless fallback, client match, 0041 seeding fired,
-- cross-tenant + double-spawn rejected, and copies-not-links: editing a template after spawn
-- leaves already-spawned tasks untouched).
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0059.
--
-- All RPCs are SECURITY DEFINER (auth.uid() from the request.jwt.claims GUC); we stay as owner and
-- drive the caller via the GUC. No RLS read leak test here (templates are agency-only), so no role
-- switch — table reads run as owner and see true state.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000059', 'ct_agencyA@test.local'),
  ('8b000000-0000-0000-0000-000000000059', 'ct_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000059', 'CT Agency A'),
  ('b0000000-0000-0000-0000-000000000059', 'CT Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000059', 'a0000000-0000-0000-0000-000000000059', 'CT Client A1');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000059', 'agency', 'a0000000-0000-0000-0000-000000000059', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000059', 'agency', 'b0000000-0000-0000-0000-000000000059', 'agency_member');

insert into public.team_member (id, agency_id, full_name, user_id, is_active) values
  ('d1000000-0000-0000-0000-000000000059', 'a0000000-0000-0000-0000-000000000059', 'CT Owner', '71000000-0000-0000-0000-000000000059', true);

-- RACI accountable for a task_type → suggested owner resolves to CT Owner.
insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value) values
  ('a0000000-0000-0000-0000-000000000059', 'Caption writing / copy', 'd1000000-0000-0000-0000-000000000059', 'A');

-- Two campaigns of the same client: one dated, one dateless.
insert into public.campaign (id, agency_id, client_id, name, phase, start_date) values
  ('e1000000-0000-0000-0000-000000000059', 'a0000000-0000-0000-0000-000000000059', 'c1000000-0000-0000-0000-000000000059', 'Dated',    'live', '2026-08-01'),
  ('e0000000-0000-0000-0000-000000000059', 'a0000000-0000-0000-0000-000000000059', 'c1000000-0000-0000-0000-000000000059', 'Dateless', 'live', null);

create temp table _tmpl (id uuid);
create temp table _tt   (id uuid);
create temp table _t    (seq int, line text);
select plan(13);

-- ============================== template + template-task CRUD ==============================
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000059","role":"authenticated"}';

insert into _tmpl select public.create_campaign_template('Launch plan', 'leads');
insert into _t select 1, is(
  (select name from public.campaign_template where id = (select id from _tmpl)), 'Launch plan', 'template persists on create');

-- t1: Caption writing (RACI-owned), offsets 0..3.  t2: Design, offsets 3..7 (no RACI → unassigned).
insert into _tt select public.create_campaign_template_task((select id from _tmpl), 'Brief', 'Caption writing / copy', 2, 0, 3);
insert into _t select 2, is(
  (select due_offset_days from public.campaign_template_task where id = (select id from _tt)), 3, 'template task persists with offsets');
select public.create_campaign_template_task((select id from _tmpl), 'Design', 'Design execution', 5, 3, 7);

-- 3) offset order validated (start_offset > due_offset rejected)
insert into _t select 3, throws_ok(
  $$ select public.create_campaign_template_task((select id from _tmpl), 'Bad', null, null, 5, 2) $$, 'P0001');

-- ============================== spawn into the DATED campaign ==============================
insert into _t select 4, is(
  public.spawn_campaign_tasks('e1000000-0000-0000-0000-000000000059', (select id from _tmpl)), 2, 'spawn returns the task count');

-- 5) spawned tasks carry the campaign_id
insert into _t select 5, is(
  (select count(*)::int from public.task where campaign_id = 'e1000000-0000-0000-0000-000000000059'), 2, 'spawned tasks carry campaign_id');

-- 6) dates are offset from the campaign start (Brief: start+0=Aug 1, due+3=Aug 4)
insert into _t select 6, is(
  (select due_date from public.task where campaign_id = 'e1000000-0000-0000-0000-000000000059' and title = 'Brief'),
  '2026-08-04'::date, 'spawned dates are offset from the campaign start_date');

-- 7) client match on every spawned task
insert into _t select 7, is(
  (select bool_and(client_id = 'c1000000-0000-0000-0000-000000000059') from public.task where campaign_id = 'e1000000-0000-0000-0000-000000000059'),
  true, 'spawned tasks match the campaign client');

-- 8) 0041 subscriber seeding fired for the spawned tasks (creator at least)
insert into _t select 8, isnt_empty(
  $$ select 1 from public.task_subscriber ts join public.task t on t.id = ts.task_id
      where t.campaign_id = 'e1000000-0000-0000-0000-000000000059' $$,
  '0041 subscriber seeding fired for spawned tasks (regression guard)');

-- ============================== dateless campaign → undated tasks ==============================
-- Spawn first (separate statement so the count is taken AFTER), then assert every spawned task is
-- undated: the count of undated tasks equals the spawn count.
create temp table _spawn0 (n int);
insert into _spawn0 select public.spawn_campaign_tasks('e0000000-0000-0000-0000-000000000059', (select id from _tmpl));
insert into _t select 9, is(
  (select count(*)::int from public.task
    where campaign_id = 'e0000000-0000-0000-0000-000000000059' and start_date is null and due_date is null),
  (select n from _spawn0),
  'spawn into a dateless campaign yields undated tasks (not an error)');

-- ============================== guards ==============================
-- 10) double-spawn into the same campaign is rejected
insert into _t select 10, throws_ok(
  $$ select public.spawn_campaign_tasks('e1000000-0000-0000-0000-000000000059', (select id from _tmpl)) $$, 'P0001');

-- 11) cross-tenant spawn rejected (agency B not agency-for-client of A's campaign)
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000059","role":"authenticated"}';
insert into _t select 11, throws_ok(
  $$ select public.spawn_campaign_tasks('e1000000-0000-0000-0000-000000000059', (select id from _tmpl)) $$, 'P0001');

-- 12) cross-tenant template edit rejected
insert into _t select 12, throws_ok(
  $$ select public.update_campaign_template((select id from _tmpl), 'Hijacked') $$, 'P0001');

-- ============================== copies, not links ==============================
-- 13) editing a template task after spawn does NOT rename the already-spawned task
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000059","role":"authenticated"}';
select public.update_campaign_template_task((select id from _tt), 'Brief EDITED', 'Caption writing / copy', 2, 0, 3);
insert into _t select 13, is(
  (select count(*)::int from public.task where campaign_id = 'e1000000-0000-0000-0000-000000000059' and title = 'Brief'),
  1, 'template edit after spawn leaves already-spawned tasks unchanged');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

-- pgTap test for 0057 — campaign brief/money/targets persist + validation + the intake gate
-- (approve-before-production), the reversible approval stamp, and the regressions that must
-- survive the create_campaign/update_campaign rebuild (phase-preserve; all-null update is a no-op).
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0057.
--
-- The RPCs are SECURITY DEFINER (read auth.uid() from the request.jwt.claims GUC); we stay as
-- the owner and drive the caller via the GUC. No role switch needed here (no RLS read check).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('72000000-0000-0000-0000-000000000057', 'cb_member@test.local'),
  ('8b000000-0000-0000-0000-000000000057', 'cb_agencyB@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000057', 'CB Agency A'),
  ('b0000000-0000-0000-0000-000000000057', 'CB Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000057', 'a0000000-0000-0000-0000-000000000057', 'CB Client A1');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('72000000-0000-0000-0000-000000000057', 'agency', 'a0000000-0000-0000-0000-000000000057', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000057', 'agency', 'b0000000-0000-0000-0000-000000000057', 'agency_member');

create temp table _c1 (id uuid);   -- the main campaign (gate + approval lifecycle)
create temp table _c2 (id uuid);   -- a second campaign (planning → closed)
create temp table _t  (seq int, line text);
select plan(21);

set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000057","role":"authenticated"}';

-- create C1 in planning with a full brief + money + targets (brief present ≠ approved)
insert into _c1
  select public.create_campaign(
    p_client_id                  => 'c1000000-0000-0000-0000-000000000057',
    p_name                       => 'Launch',
    p_objective                  => 'leads',
    p_phase                      => 'planning',
    p_brief                      => 'The launch brief',
    p_media_budget               => 1000,
    p_fee                        => 5000,
    p_kpi_target_results         => 200,
    p_kpi_target_cost_per_result => 20);

-- 1-5) new fields persist on create
insert into _t select 1, is((select brief                      from public.campaign where id=(select id from _c1)), 'The launch brief', 'brief persists on create');
insert into _t select 2, is((select media_budget               from public.campaign where id=(select id from _c1)), 1000::numeric, 'media_budget persists on create');
insert into _t select 3, is((select fee                        from public.campaign where id=(select id from _c1)), 5000::numeric, 'fee persists on create');
insert into _t select 4, is((select kpi_target_results         from public.campaign where id=(select id from _c1)), 200::numeric, 'kpi_target_results persists on create');
insert into _t select 5, is((select kpi_target_cost_per_result from public.campaign where id=(select id from _c1)), 20::numeric, 'kpi_target_cost_per_result persists on create');

-- 6-9) negative money/targets rejected on create
insert into _t select 6, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000057', p_name => 'Bad fee', p_fee => -1) $$, 'P0001');
insert into _t select 7, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000057', p_name => 'Bad budget', p_media_budget => -1) $$, 'P0001');
insert into _t select 8, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000057', p_name => 'Bad results', p_kpi_target_results => -1) $$, 'P0001');
insert into _t select 9, throws_ok(
  $$ select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000057', p_name => 'Bad cpr', p_kpi_target_cost_per_result => -1) $$, 'P0001');

-- 10-11) new fields persist on update (full-overwrite: resend the whole state)
select public.update_campaign(
  p_id => (select id from _c1), p_name => 'Launch', p_objective => 'leads',
  p_brief => 'Revised brief', p_media_budget => 1000, p_fee => 6000,
  p_kpi_target_results => 200, p_kpi_target_cost_per_result => 20);
insert into _t select 10, is((select brief from public.campaign where id=(select id from _c1)), 'Revised brief', 'brief persists on update');
insert into _t select 11, is((select fee   from public.campaign where id=(select id from _c1)), 6000::numeric, 'fee persists on update');

-- 12) intake gate: planning → production while unapproved is rejected
insert into _t select 12, throws_ok(
  $$ select public.update_campaign(p_id => (select id from _c1), p_name => 'Launch', p_phase => 'production') $$, 'P0001');

-- approve the brief, then the same advance succeeds
select public.set_brief_approved((select id from _c1), true);
insert into _t select 13, lives_ok(
  $$ select public.update_campaign(p_id => (select id from _c1), p_name => 'Launch', p_phase => 'production') $$,
  'approved brief lets planning → production through');

-- 14-15) approval stamped who + when
insert into _t select 14, isnt(
  (select brief_approved_at from public.campaign where id=(select id from _c1)), null, 'approval stamps brief_approved_at');
insert into _t select 15, is(
  (select brief_approved_by from public.campaign where id=(select id from _c1)),
  '72000000-0000-0000-0000-000000000057'::uuid, 'approval stamps brief_approved_by = approver');

-- 16-17) un-approve clears both
select public.set_brief_approved((select id from _c1), false);
insert into _t select 16, is((select brief_approved_at from public.campaign where id=(select id from _c1)), null, 'un-approve clears brief_approved_at');
insert into _t select 17, is((select brief_approved_by from public.campaign where id=(select id from _c1)), null, 'un-approve clears brief_approved_by');

-- 18) planning → closed is allowed while unapproved (an abandoned campaign needs no brief)
insert into _c2
  select public.create_campaign(p_client_id => 'c1000000-0000-0000-0000-000000000057', p_name => 'Abandoned');
select public.update_campaign(p_id => (select id from _c2), p_name => 'Abandoned', p_phase => 'closed');
insert into _t select 18, is((select phase from public.campaign where id=(select id from _c2)), 'closed', 'planning → closed allowed while unapproved');

-- 19) cross-tenant: agency B cannot approve agency A's brief
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000057","role":"authenticated"}';
insert into _t select 19, throws_ok(
  $$ select public.set_brief_approved((select id from _c1), true) $$, 'P0001');

-- ---------- regressions after the rebuild ----------
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000057","role":"authenticated"}';
-- 20) phase-preserve still holds: C1 is 'production' — an update that omits the phase keeps it
-- (and the gate does NOT falsely fire on a non-transition even though the brief is now unapproved)
select public.update_campaign(p_id => (select id from _c1), p_name => 'Launch', p_objective => 'leads');
insert into _t select 20, is((select phase from public.campaign where id=(select id from _c1)), 'production', 'update preserves phase when p_phase omitted (regression)');

-- 21) an all-new-fields-null update does not error (name only)
insert into _t select 21, lives_ok(
  $$ select public.update_campaign(p_id => (select id from _c1), p_name => 'Launch') $$,
  'all-null update is a no-op, not an error (regression)');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

-- pgTap test for 0048 — client_internal writes are RPC-only; raci_value is constrained.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0048.
--
-- Direct writes are tested under the authenticated role: with no write policy, an
-- INSERT raises 42501 and an UPDATE silently matches no rows — so after the attempt we
-- drop to postgres (not reset) and read the true state. The RPC path (update_client,
-- SECURITY DEFINER) must still work for an agency member.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000048', 'cis_member@test.local'),
  ('8b000000-0000-0000-0000-000000000048', 'cis_outsider@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000048', 'CIS Agency A'),
  ('b0000000-0000-0000-0000-000000000048', 'CIS Agency B');

insert into public.client (id, agency_id, name) values
  ('c0000000-0000-0000-0000-000000000048', 'a0000000-0000-0000-0000-000000000048', 'CIS Client');

insert into public.client_internal (client_id, notes, retainer_amount) values
  ('c0000000-0000-0000-0000-000000000048', 'original notes', 1000);

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000048', 'agency', 'a0000000-0000-0000-0000-000000000048', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000048', 'agency', 'b0000000-0000-0000-0000-000000000048', 'agency_admin');

insert into public.team_member (id, agency_id, full_name, email) values
  ('d0000000-0000-0000-0000-000000000048', 'a0000000-0000-0000-0000-000000000048', 'CIS Person', 'cis_person@test.local');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(6);

-- ===== agency member: direct table writes are closed =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000048","role":"authenticated"}';

-- 1) direct INSERT is rejected outright (no write policy → RLS violation)
insert into _t select 1, throws_ok(
  $$ insert into public.client_internal (client_id, notes) values ('c0000000-0000-0000-0000-000000000048', 'x') $$,
  '42501');

-- 2) direct UPDATE silently matches nothing — value unchanged when read as owner
update public.client_internal set retainer_amount = 9999
 where client_id = 'c0000000-0000-0000-0000-000000000048';
set local role postgres;
insert into _t select 2, is(
  (select retainer_amount from public.client_internal where client_id = 'c0000000-0000-0000-0000-000000000048'),
  1000::numeric, 'direct update by an agency member does not stick');

-- 3) the RPC path still works for the same member
set local role authenticated;
select public.update_client(
  p_client_id => 'c0000000-0000-0000-0000-000000000048',
  p_name => 'CIS Client',
  p_notes => 'updated via rpc',
  p_retainer_amount => 2500);
set local role postgres;
insert into _t select 3, is(
  (select retainer_amount from public.client_internal where client_id = 'c0000000-0000-0000-0000-000000000048'),
  2500::numeric, 'update_client RPC still writes client_internal');

-- 4) a cross-tenant admin still cannot use the RPC against this client
set local role authenticated;
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000048","role":"authenticated"}';
insert into _t select 4, throws_ok(
  $$ select public.update_client(p_client_id => 'c0000000-0000-0000-0000-000000000048', p_name => 'hijack') $$,
  'P0001');

-- ===== raci_value CHECK =====
set local role postgres;

-- 5) an illegal RACI value is rejected by the constraint
insert into _t select 5, throws_ok(
  $$ insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value)
     values ('a0000000-0000-0000-0000-000000000048', 'cis_test', 'd0000000-0000-0000-0000-000000000048', 'X') $$,
  '23514');

-- 6) a legal value (including the combined form) inserts fine
insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value)
values ('a0000000-0000-0000-0000-000000000048', 'cis_test', 'd0000000-0000-0000-0000-000000000048', 'A/R');
insert into _t select 6, isnt_empty(
  $$ select 1 from public.raci_matrix
      where agency_id = 'a0000000-0000-0000-0000-000000000048' and task_type = 'cis_test' $$,
  'legal raci_value inserts');

-- ---------- emit ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

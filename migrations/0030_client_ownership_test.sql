-- pgTap test for 0030 — client_ownership RLS + RPC authorisation. Paste into the
-- Supabase SQL editor and run. No basejump; only pgtap. begin; … rollback;.
-- Requires 0015 helpers + 0030 applied.
--
-- Agency-scoped read (RLS) — reads run as `set local role authenticated` + a jwt GUC;
-- the SECURITY DEFINER RPC works under the same.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (owner) ----------
insert into auth.users (id, email) values
  ('7a000000-0000-0000-0000-000000000030', 'own_a@test.local'),   -- agency A
  ('8b000000-0000-0000-0000-000000000030', 'own_b@test.local');   -- agency B (cross-tenant)

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000030', 'Own Agency A'),
  ('b0000000-0000-0000-0000-000000000030', 'Own Agency B');
insert into public.client (id, agency_id, name) values
  ('c0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000030', 'Own Client');
insert into public.team_member (id, agency_id, full_name) values
  ('d0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000030', 'Owner One');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('7a000000-0000-0000-0000-000000000030', 'agency', 'a0000000-0000-0000-0000-000000000030', 'agency_admin'),
  ('8b000000-0000-0000-0000-000000000030', 'agency', 'b0000000-0000-0000-0000-000000000030', 'agency_admin');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(4);

-- ===== agency A: set + read =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-0000-0000-000000000030","role":"authenticated"}';
select public.set_client_ownership('c0000000-0000-0000-0000-000000000030', p_lead_pm_id => 'd0000000-0000-0000-0000-000000000030');

-- 1) agency sets and reads (RLS) its client's ownership.
insert into _t select 1, isnt_empty(
  $$ select 1 from public.client_ownership
       where client_id='c0000000-0000-0000-0000-000000000030'
         and lead_pm_id='d0000000-0000-0000-0000-000000000030' $$,
  'agency sets and reads client ownership'
);

-- 2) re-set is a full upsert: lead_pm cleared, creative_lead set.
select public.set_client_ownership('c0000000-0000-0000-0000-000000000030', p_creative_lead_id => 'd0000000-0000-0000-0000-000000000030');
set local role postgres;
insert into _t select 2, isnt_empty(
  $$ select 1 from public.client_ownership
       where client_id='c0000000-0000-0000-0000-000000000030'
         and lead_pm_id is null
         and creative_lead_id='d0000000-0000-0000-0000-000000000030' $$,
  'set_client_ownership upserts (replaces all slots)'
);

-- ===== cross-tenant agency B =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000030","role":"authenticated"}';
-- 3) another agency cannot read this client's ownership.
insert into _t select 3, is_empty(
  $$ select 1 from public.client_ownership where client_id='c0000000-0000-0000-0000-000000000030' $$,
  'cross-tenant agency cannot read client ownership'
);
-- 4) another agency cannot write it.
insert into _t select 4, throws_ok(
  $$ select public.set_client_ownership('c0000000-0000-0000-0000-000000000030', p_lead_pm_id => 'd0000000-0000-0000-0000-000000000030') $$,
  'P0001'
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

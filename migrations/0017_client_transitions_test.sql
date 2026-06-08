-- pgTap test for 0017 — client-authorised transitions. Paste into the Supabase SQL
-- editor and run. No basejump; only pgtap. Wrapped in begin; … rollback;.
-- Requires 0017_client_transitions.sql applied first.
--
-- Proven hosted pattern (as per the 0015/0016 tests):
--  * Fixtures, the _t results table, `grant insert on _t to authenticated`, and
--    plan() all happen BEFORE any role switch (as the owner).
--  * We act AS the client via `set local role authenticated` + a jwt-claims GUC,
--    and drop back with `set local role postgres` (NOT reset role) to read true state.
--  * throws_ok uses the 2-arg (sql, sqlstate) form — the raises are RAISE EXCEPTION,
--    i.e. SQLSTATE P0001. is() is used for the resulting-state (happy-path) checks.
--  * All TAP lines are aggregated via union all so the editor returns every row.

begin;

create extension if not exists pgtap;

-- ---------- fixtures (as the owner; RLS bypassed) ----------
insert into auth.users (id, email)
values ('60000000-0000-0000-0000-000000000017', 'portal_client@test.local');

insert into public.agency (id, name)
values ('a0000000-0000-0000-0000-000000000017', 'Transitions Test Agency');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000017', 'Transitions Client A'),
  ('c2000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000017', 'Transitions Client B');

-- The test user is a client_approver for Client A only (no agency membership).
insert into public.membership (user_id, scope_type, scope_id, role)
values ('60000000-0000-0000-0000-000000000017', 'client',
        'c1000000-0000-0000-0000-000000000017', 'client_approver');

-- Posts: three client_review on A (approve / request_changes / mark_posted attempts),
-- one draft on A, one client_review on B (the other client).
insert into public.content_item (id, client_id, status, title) values
  ('10000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000017', 'client_review', 'A cr1'),
  ('10000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000017', 'client_review', 'A cr2'),
  ('10000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000017', 'client_review', 'A cr3'),
  ('10000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000017', 'draft',         'A draft'),
  ('20000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000017', 'client_review', 'B cr');

create temp table _t (seq int, line text);
grant insert on _t to authenticated;

select plan(5);

-- ---------- act as the client ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-0000-0000-000000000017","role":"authenticated"}';

-- Happy-path actions (must succeed; performed here, asserted on state below).
select public.transition_post('10000000-0000-0000-0000-000000000001', 'approve');
select public.transition_post('10000000-0000-0000-0000-000000000002', 'request_changes', null);

-- Failure modes (each RAISE EXCEPTION → SQLSTATE P0001).
-- 3) any agency-only action (mark_posted) is rejected for a client.
insert into _t select 3, throws_ok(
  $$ select public.transition_post('10000000-0000-0000-0000-000000000003', 'mark_posted') $$,
  'P0001'
);
-- 4) approve from a non-client_review status (draft) is rejected.
insert into _t select 4, throws_ok(
  $$ select public.transition_post('10000000-0000-0000-0000-000000000004', 'approve') $$,
  'P0001'
);
-- 5) the cross-tenant case: acting on ANOTHER client's client_review post is rejected
--    (the RLS-bypass case — authorisation must catch it inside the function).
insert into _t select 5, throws_ok(
  $$ select public.transition_post('20000000-0000-0000-0000-000000000005', 'approve') $$,
  'P0001'
);

-- ---------- read true state as the owner for the happy-path assertions ----------
set local role postgres;

insert into _t select 1, is(
  (select status from public.content_item where id = '10000000-0000-0000-0000-000000000001')::text,
  'approved',
  'client approve on a client_review post -> approved'
);
insert into _t select 2, is(
  (select status from public.content_item where id = '10000000-0000-0000-0000-000000000002')::text,
  'changes_requested',
  'client request_changes (null note) on a client_review post -> changes_requested'
);

-- ---------- emit every TAP line (plus the pgTap footer) ----------
select x.line
from (
  select seq, line from _t
  union all
  select 99 as seq, f.line from finish() as f(line)
) x
order by x.seq;

rollback;

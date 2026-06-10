-- pgTap test for 0038 — reschedule_content_item authorisation + mark_posted rules.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0038.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000038', 'rs_agencyA@test.local'),
  ('8b000000-0000-0000-0000-000000000038', 'rs_agencyB@test.local'),
  ('7c000000-0000-0000-0000-000000000038', 'rs_client@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000038', 'RS Agency A'),
  ('b0000000-0000-0000-0000-000000000038', 'RS Agency B');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000038', 'a0000000-0000-0000-0000-000000000038', 'RS Client A');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000038', 'agency', 'a0000000-0000-0000-0000-000000000038', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000038', 'agency', 'b0000000-0000-0000-0000-000000000038', 'agency_member'),
  ('7c000000-0000-0000-0000-000000000038', 'client', 'ca000000-0000-0000-0000-000000000038', 'client_approver');

-- p1 is approved (eligible for mark_posted); p_draft is draft (must stay draft).
insert into public.content_item (id, client_id, title, status, scheduled_at) values
  ('e1000000-0000-0000-0000-000000000038', 'ca000000-0000-0000-0000-000000000038', 'Approved post', 'approved', '2026-06-15 08:00:00+00'),
  ('e2000000-0000-0000-0000-000000000038', 'ca000000-0000-0000-0000-000000000038', 'Draft post',    'draft',    '2026-06-15 08:00:00+00');

create temp table _t (seq int, line text);
select plan(5);

-- ===== agency A acts =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000038","role":"authenticated"}';

-- 1) agency can reschedule its post
select public.reschedule_content_item('e1000000-0000-0000-0000-000000000038', '2026-07-01 09:00:00+00', false);
insert into _t select 1, is(
  (select scheduled_at from public.content_item where id = 'e1000000-0000-0000-0000-000000000038'),
  '2026-07-01 09:00:00+00'::timestamptz, 'agency reschedules its own post'
);

-- 2) a client member cannot reschedule (the boundary)
set local request.jwt.claims = '{"sub":"7c000000-0000-0000-0000-000000000038","role":"authenticated"}';
insert into _t select 2, throws_ok(
  $$ select public.reschedule_content_item('e1000000-0000-0000-0000-000000000038', '2026-07-02 09:00:00+00', false) $$,
  'P0001'
);

-- 3) mark_posted transitions an approved post to posted
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000038","role":"authenticated"}';
select public.reschedule_content_item('e1000000-0000-0000-0000-000000000038', '2026-05-01 09:00:00+00', true);
insert into _t select 3, is(
  (select status::text from public.content_item where id = 'e1000000-0000-0000-0000-000000000038'),
  'posted', 'mark_posted moves an approved post to posted'
);

-- 4) mark_posted on a draft does NOT change status
select public.reschedule_content_item('e2000000-0000-0000-0000-000000000038', '2026-05-01 09:00:00+00', true);
insert into _t select 4, is(
  (select status::text from public.content_item where id = 'e2000000-0000-0000-0000-000000000038'),
  'draft', 'mark_posted is ignored for a draft (no illegal jump to posted)'
);

-- 5) an agency member of another agency cannot reschedule (cross-tenant)
set local request.jwt.claims = '{"sub":"8b000000-0000-0000-0000-000000000038","role":"authenticated"}';
insert into _t select 5, throws_ok(
  $$ select public.reschedule_content_item('e1000000-0000-0000-0000-000000000038', '2026-07-03 09:00:00+00', false) $$,
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

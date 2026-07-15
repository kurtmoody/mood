-- pgTap test for 0058 — the client-facing campaign surface. This leak battery is the point of
-- the slice: milestones are visible ONLY to members of the milestone's campaign's client; the
-- `campaign` table stays unreadable by clients (no policy); and the client-facing RPCs project a
-- whitelist (no fee/brief/kpi) to members only, surfacing production/live/wrapped only.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0058.
--
-- Harness: milestone RLS reads run under `set local role authenticated` + a request.jwt.claims
-- GUC (dropping to `set local role postgres` to read true state); temp tables read under that
-- role need explicit grants (the 0056 42501 lesson). SECURITY DEFINER RPCs are driven by the GUC
-- while we stay as the owner. Fixed UUID literals so the role-switched blocks touch no temp table.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000058', 'cv_agencyA@test.local'),
  ('72000000-0000-0000-0000-000000000058', 'cv_clientA1@test.local'),
  ('73000000-0000-0000-0000-000000000058', 'cv_clientA2@test.local'),
  ('8b000000-0000-0000-0000-000000000058', 'cv_agencyB@test.local'),
  ('8c000000-0000-0000-0000-000000000058', 'cv_clientB1@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000058', 'CV Agency A'),
  ('b0000000-0000-0000-0000-000000000058', 'CV Agency B');

insert into public.client (id, agency_id, name) values
  ('c1000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000058', 'CV Client A1'),
  ('c2000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000058', 'CV Client A2'),
  ('cb000000-0000-0000-0000-000000000058', 'b0000000-0000-0000-0000-000000000058', 'CV Client B1');

-- Client-scope members (client users: client membership + no agency membership) + agency members.
insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000058', 'agency', 'a0000000-0000-0000-0000-000000000058', 'agency_member'),
  ('8b000000-0000-0000-0000-000000000058', 'agency', 'b0000000-0000-0000-0000-000000000058', 'agency_member'),
  ('72000000-0000-0000-0000-000000000058', 'client', 'c1000000-0000-0000-0000-000000000058', 'client_viewer'),
  ('73000000-0000-0000-0000-000000000058', 'client', 'c2000000-0000-0000-0000-000000000058', 'client_viewer'),
  ('8c000000-0000-0000-0000-000000000058', 'client', 'cb000000-0000-0000-0000-000000000058', 'client_viewer');

-- Campaigns: A1 live + A1 planning (should be hidden from the client path), A2 live.
insert into public.campaign (id, agency_id, client_id, name, phase, media_budget, fee, brief) values
  ('e1000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000058', 'c1000000-0000-0000-0000-000000000058', 'A1 Live',     'live',       1000, 5000, 'secret brief'),
  ('e3000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000058', 'c1000000-0000-0000-0000-000000000058', 'A1 Planning', 'planning',    500, 2000, 'secret brief'),
  ('e2000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000058', 'c2000000-0000-0000-0000-000000000058', 'A2 Live',     'live',        800, 4000, 'secret brief');

-- Milestones on A1 Live (inserted as owner — fixtures bypass RLS).
insert into public.campaign_milestone (id, campaign_id, title, status, sort_order) values
  ('f1000000-0000-0000-0000-000000000058', 'e1000000-0000-0000-0000-000000000058', 'Kickoff', 'done', 0),
  ('f2000000-0000-0000-0000-000000000058', 'e1000000-0000-0000-0000-000000000058', 'Launch',  'upcoming', 1);

create temp table _t (seq int, line text);
grant insert on _t to authenticated;
select plan(13);

-- ============================== milestone RLS (role authenticated) ==============================
-- client A1 sees A1's milestones; NOT A2's; and cannot read `campaign` directly.
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 1, isnt_empty(
  $$ select 1 from public.campaign_milestone where campaign_id = 'e1000000-0000-0000-0000-000000000058' $$,
  'client member reads their campaign''s milestones');
insert into _t select 2, is_empty(
  $$ select 1 from public.campaign_milestone where campaign_id = 'e2000000-0000-0000-0000-000000000058' $$,
  'client member cannot read another client''s milestones');
insert into _t select 4, is_empty(
  $$ select 1 from public.campaign where id = 'e1000000-0000-0000-0000-000000000058' $$,
  'client cannot read the campaign row directly (no policy — fee/brief stay hidden)');

-- cross-agency: client B1 sees nothing of A1.
set local request.jwt.claims = '{"sub":"8c000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 3, is_empty(
  $$ select 1 from public.campaign_milestone where campaign_id = 'e1000000-0000-0000-0000-000000000058' $$,
  'cross-agency client cannot read the milestones');

set local role postgres;

-- ============================== client-facing RPCs (owner + GUC) ==============================
-- client A1 gets their live campaign back.
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 5, is(
  (select count(*)::int from public.get_client_campaign('e1000000-0000-0000-0000-000000000058')),
  1, 'get_client_campaign returns the campaign to a client member');

-- the return SHAPE excludes fee / brief / kpi entirely (cannot be column-referenced).
insert into _t select 6, ok(
      position('fee'   in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('brief' in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('kpi'   in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) = 0
  and position('media_budget' in pg_get_function_result('public.get_client_campaign(uuid)'::regprocedure)) > 0,
  'get_client_campaign return type whitelists media_budget and omits fee/brief/kpi');

-- get_client_campaigns hides the planning campaign — only A1 Live comes back.
insert into _t select 8, is(
  (select count(*)::int from public.get_client_campaigns('c1000000-0000-0000-0000-000000000058')),
  1, 'get_client_campaigns surfaces production/live/wrapped only (planning hidden)');
insert into _t select 9, is(
  (select id from public.get_client_campaigns('c1000000-0000-0000-0000-000000000058')),
  'e1000000-0000-0000-0000-000000000058'::uuid, 'get_client_campaigns returns the live campaign, not the planning one');

-- non-member (client B1) rejected from both RPCs.
set local request.jwt.claims = '{"sub":"8c000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 7, throws_ok(
  $$ select * from public.get_client_campaign('e1000000-0000-0000-0000-000000000058') $$, 'P0001');
insert into _t select 10, throws_ok(
  $$ select * from public.get_client_campaigns('c1000000-0000-0000-0000-000000000058') $$, 'P0001');

-- ============================== milestone write authorisation ==============================
-- agency A can create a milestone.
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 11, lives_ok(
  $$ select public.create_campaign_milestone('e1000000-0000-0000-0000-000000000058', 'Review gate', '2026-08-01', '2026-08-05') $$,
  'agency member can create a campaign milestone');
-- start > end rejected.
insert into _t select 13, throws_ok(
  $$ select public.create_campaign_milestone('e1000000-0000-0000-0000-000000000058', 'Bad dates', '2026-09-10', '2026-09-01') $$,
  'P0001');

-- client cannot call the write RPC.
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000058","role":"authenticated"}';
insert into _t select 12, throws_ok(
  $$ select public.create_campaign_milestone('e1000000-0000-0000-0000-000000000058', 'Client tries', null, null) $$,
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

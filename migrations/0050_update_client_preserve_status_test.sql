-- pgTap test for 0050 — update_client preserves status / timezone / currency on omit.
-- Paste into the Supabase SQL editor and run. begin; … rollback;. Requires 0050.
--
-- RPC keys off auth.uid() (SECURITY DEFINER); we stay as the owner and drive the caller
-- via the request.jwt.claims GUC. Reads run as the owner (true state).

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000050', 'uc_admin@test.local');

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000050', 'UC Agency');

-- Client starts archived, with a non-default timezone and a GBP currency on client_internal.
insert into public.client (id, agency_id, name, status, timezone) values
  ('ca000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000050', 'UC Client', 'archived', 'America/New_York');

insert into public.client_internal (client_id, currency) values
  ('ca000000-0000-0000-0000-000000000050', 'GBP');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000050', 'agency', 'a0000000-0000-0000-0000-000000000050', 'agency_admin');

create temp table _t (seq int, line text);
select plan(3);

-- ===== admin edits a non-status field, omitting status / timezone / currency =====
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000050","role":"authenticated"}';

select public.update_client(
  p_client_id => 'ca000000-0000-0000-0000-000000000050',
  p_name      => 'UC Client',
  p_website   => 'https://example.test'
);

-- 1) status preserved (the revert bug)
insert into _t select 1, is(
  (select status from public.client where id = 'ca000000-0000-0000-0000-000000000050'),
  'archived', 'omitting p_status preserves the archived status'
);

-- 2) timezone preserved
insert into _t select 2, is(
  (select timezone from public.client where id = 'ca000000-0000-0000-0000-000000000050'),
  'America/New_York', 'omitting p_timezone preserves the existing timezone'
);

-- 3) currency preserved
insert into _t select 3, is(
  (select currency from public.client_internal where client_id = 'ca000000-0000-0000-0000-000000000050'),
  'GBP', 'omitting p_currency preserves the existing currency'
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

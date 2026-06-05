-- ============================================================
-- CADENCE — database schema, security rules, and sample data
-- Paste this WHOLE file into Supabase → SQL Editor → New query → Run.
-- It is safe to run repeatedly — the reset block below clears any half-built state first.
-- ============================================================

-- ---------- 0. Reset (clears previous attempts so this can be re-run) ----------
drop table if exists
  public.approval_event, public.comment, public.asset, public.content_version,
  public.content_item, public.channel, public.membership, public.client, public.agency cascade;
drop type if exists content_status;
drop type if exists member_role;

-- ---------- 1. Custom types ----------
create type member_role    as enum ('agency_admin','agency_member','client_approver','client_viewer');
create type content_status as enum ('draft','internal_review','client_review','changes_requested','approved','scheduled','posted');

-- ---------- 2. Tables ----------
-- (Supabase already provides auth.users — we never create a users table.)

create table public.agency (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  brand_colour text,
  created_at  timestamptz default now()
);

create table public.client (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agency(id) on delete cascade,
  name        text not null,
  logo_url    text,
  brand_colour text,
  timezone    text default 'Europe/Malta',
  status      text default 'active',
  created_at  timestamptz default now()
);

create table public.membership (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope_type  text not null check (scope_type in ('agency','client')),
  scope_id    uuid not null,
  role        member_role not null,
  created_at  timestamptz default now(),
  unique (user_id, scope_type, scope_id)
);

create table public.channel (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.client(id) on delete cascade,
  type        text not null,   -- instagram | facebook | linkedin | tiktok | blog | newsletter | ...
  label       text
);

create table public.content_item (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.client(id) on delete cascade,
  channel_id      uuid references public.channel(id) on delete set null,
  title           text,
  content_type    text not null default 'post', -- post | story | reel | carousel | blog | newsletter | ...
  scheduled_at    timestamptz,
  status          content_status not null default 'draft',
  current_version_id uuid,
  created_by      uuid references auth.users(id),
  assigned_to     uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table public.content_version (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  version_no      int not null default 1,
  body            text,
  internal_note   text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now()
);

create table public.asset (
  id                 uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references public.content_version(id) on delete cascade,
  source             text not null default 'upload',  -- 'upload' | 'gdrive'
  file_url           text,
  drive_file_id      text,
  drive_web_url      text,
  thumbnail_url      text,
  media_type         text,
  filename           text,
  size_bytes         bigint
);

create table public.comment (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  version_id      uuid references public.content_version(id) on delete set null,
  author_id       uuid references auth.users(id),
  body            text not null,
  parent_id       uuid references public.comment(id) on delete cascade,
  annotation_x    real,
  annotation_y    real,
  resolved        boolean default false,
  created_at      timestamptz default now()
);

create table public.approval_event (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  version_id      uuid references public.content_version(id),
  actor_id        uuid references auth.users(id),
  action          text not null,  -- submitted_internal | internal_approved | submitted_client | client_approved | changes_requested | posted
  note            text,
  created_at      timestamptz default now()
);

-- (agency_integration for Google Drive arrives in Part 3 — not needed yet.)

-- ---------- 3. Helper functions used by the security rules ----------
-- Which client IDs is the logged-in user allowed to see?
--  - clients they're directly a member of, AND
--  - every client belonging to an agency they're a member of.
create or replace function public.client_ids_for_user()
returns setof uuid
language sql security definer stable set search_path = ''
as $$
  select scope_id
    from public.membership
   where user_id = auth.uid() and scope_type = 'client'
  union
  select c.id
    from public.client c
    join public.membership m
      on m.scope_type = 'agency' and m.scope_id = c.agency_id
   where m.user_id = auth.uid();
$$;

-- Is the logged-in user an agency teammate (admin/member) for this client?
create or replace function public.is_agency_for_client(c uuid)
returns boolean
language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1
      from public.client cl
      join public.membership m
        on m.scope_type = 'agency' and m.scope_id = cl.agency_id
     where cl.id = c
       and m.user_id = auth.uid()
       and m.role in ('agency_admin','agency_member')
  );
$$;

-- ---------- 4. Turn on Row-Level Security + add policies ----------
-- Once RLS is ON, NOTHING is readable unless a policy allows it. This is the
-- safety net: clients only ever see their own workspace.

alter table public.agency          enable row level security;
alter table public.client          enable row level security;
alter table public.membership      enable row level security;
alter table public.channel         enable row level security;
alter table public.content_item    enable row level security;
alter table public.content_version enable row level security;
alter table public.asset           enable row level security;
alter table public.comment         enable row level security;
alter table public.approval_event  enable row level security;

-- You can read your own memberships (so the app knows your roles)
create policy membership_self on public.membership
  for select using (user_id = auth.uid());

-- You can read agencies you belong to
create policy agency_read on public.agency
  for select using (
    id in (select scope_id from public.membership
            where user_id = auth.uid() and scope_type = 'agency')
  );

-- You can read clients you're allowed to see
create policy client_read on public.client
  for select using (id in (select public.client_ids_for_user()));

-- Channels: read if you can see the parent client
create policy channel_read on public.channel
  for select using (client_id in (select public.client_ids_for_user()));

-- Content items: everyone in the client can READ; only agency teammates can WRITE
create policy ci_read on public.content_item
  for select using (client_id in (select public.client_ids_for_user()));
create policy ci_write on public.content_item
  for all to authenticated
  using      (public.is_agency_for_client(client_id))
  with check (public.is_agency_for_client(client_id));

-- Versions / assets / events / comments: read if you can see the parent item
create policy cv_read on public.content_version
  for select using (content_item_id in
    (select id from public.content_item where client_id in (select public.client_ids_for_user())));
create policy asset_read on public.asset
  for select using (content_version_id in
    (select id from public.content_version where content_item_id in
      (select id from public.content_item where client_id in (select public.client_ids_for_user()))));
create policy ae_read on public.approval_event
  for select using (content_item_id in
    (select id from public.content_item where client_id in (select public.client_ids_for_user())));
create policy comment_read on public.comment
  for select using (content_item_id in
    (select id from public.content_item where client_id in (select public.client_ids_for_user())));

-- Anyone who can see an item can comment on it (clients included)
create policy comment_insert on public.comment
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and content_item_id in
      (select id from public.content_item where client_id in (select public.client_ids_for_user()))
  );

-- (Write policies for client approvals + versions arrive in Part 2.)

-- ---------- 5. Sample data (fixed IDs so they're easy to copy) ----------
insert into public.agency (id, name, brand_colour) values
  ('00000000-0000-0000-0000-000000000001','Mood Agency','#0E9F77');

insert into public.client (id, agency_id, name, brand_colour, timezone) values
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
   'Hotel Valentina','#13352e','Europe/Malta');

insert into public.channel (id, client_id, type, label) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000002','instagram','@hotelvalentina'),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000002','facebook','Hotel Valentina'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000002','linkedin','Hotel Valentina'),
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-000000000002','blog','Blog'),
  ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-000000000002','newsletter','Newsletter');

-- Items are scheduled relative to THIS week, so they always show on the calendar.
-- date_trunc('week', now()) = Monday 00:00 of the current week.
insert into public.content_item (client_id, channel_id, title, content_type, scheduled_at, status) values
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a5','June at Valentina — what''s new', 'newsletter', date_trunc('week', now()) + interval '0 day 8 hour',  'scheduled'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Golden hour on the terrace',      'post',       date_trunc('week', now()) + interval '0 day 17 hour', 'approved'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a4','5 reasons to book direct',        'blog',       date_trunc('week', now()) + interval '1 day 10 hour', 'client_review'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','New summer menu',                 'post',       date_trunc('week', now()) + interval '2 day 12 hour', 'approved'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a3','Meet Karl, our concierge',        'post',       date_trunc('week', now()) + interval '3 day 9 hour',  'client_review'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Sea-view suites now open',        'carousel',   date_trunc('week', now()) + interval '4 day 10 hour', 'client_review'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a2','Midweek spa rate',                'post',       date_trunc('week', now()) + interval '4 day 18 hour', 'changes_requested'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Weekend brunch',                  'post',       date_trunc('week', now()) + interval '5 day 12 hour', 'approved'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a4','A local''s guide to St Paul''s Bay','blog',     date_trunc('week', now()) + interval '6 day 17 hour', 'scheduled');

-- ============================================================
-- AFTER you log in for the first time (Step 6 of the guide),
-- come back here and run THIS to make yourself the agency admin.
-- Replace the email with the one you logged in with:
--
--   insert into public.membership (user_id, scope_type, scope_id, role)
--   select id, 'agency', '00000000-0000-0000-0000-000000000001', 'agency_admin'
--   from auth.users where email = 'YOU@EXAMPLE.COM';
--
-- Until you do this, the calendar will be empty — that's RLS doing its job.
-- ============================================================

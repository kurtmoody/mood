-- pgTap test for 0055 — split_post_channel: guards + the happy path (new draft, copied
-- content, detached original, cloned media). Paste into the Supabase SQL editor and run.
-- Requires 0055.
--
-- split_post_channel is SECURITY DEFINER and reads auth.uid() from the request.jwt.claims
-- GUC, so we stay as the OWNER and only drive the caller via the GUC; reads run as the owner
-- (true state). The happy-path call is captured into a temp table so its returned jsonb
-- (new_item_id + media pairs) can be asserted on.

begin;

create extension if not exists pgtap;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000055', 'sp_agencyA@test.local');  -- agency A member, the actor

insert into public.agency (id, name) values
  ('a0000000-0000-0000-0000-000000000055', 'SP Agency A');

insert into public.client (id, agency_id, name) values
  ('ca000000-0000-0000-0000-000000000055', 'a0000000-0000-0000-0000-000000000055', 'SP Client C');

insert into public.channel (id, client_id, type, label) values
  ('c1000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055', 'instagram', 'C IG'),
  ('c2000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055', 'facebook',  'C FB'),
  ('c3000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055', 'linkedin',  'C LI'); -- not on P2

-- A single-channel draft post (P1) and a two-channel post (P2, in client_review).
insert into public.content_item (id, client_id, channel_id, title, content_type, status) values
  ('e1000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055', 'SP Single', 'post', 'draft'),
  ('e2000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055', 'SP Split Me', 'post', 'client_review');

-- P2's current version + content.
insert into public.content_version (id, content_item_id, version_no, body, visual_content) values
  ('f2000000-0000-0000-0000-000000000055', 'e2000000-0000-0000-0000-000000000055', 1, 'Caption X', 'Visual Y');
update public.content_item set current_version_id = 'f2000000-0000-0000-0000-000000000055'
  where id = 'e2000000-0000-0000-0000-000000000055';

-- Two media on P2's current version.
insert into public.media (version_id, storage_path, mime_type, sort_order) values
  ('f2000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055/e2000000-0000-0000-0000-000000000055/f2000000-0000-0000-0000-000000000055/a.jpg', 'image/jpeg', 0),
  ('f2000000-0000-0000-0000-000000000055', 'ca000000-0000-0000-0000-000000000055/e2000000-0000-0000-0000-000000000055/f2000000-0000-0000-0000-000000000055/b.jpg', 'image/jpeg', 1);

-- Channel links: P1 → {c1}; P2 → {c1, c2}.
insert into public.content_item_channel (content_item_id, channel_id) values
  ('e1000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055'),
  ('e2000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055'),
  ('e2000000-0000-0000-0000-000000000055', 'c2000000-0000-0000-0000-000000000055');

insert into public.membership (user_id, scope_type, scope_id, role) values
  ('71000000-0000-0000-0000-000000000055', 'agency', 'a0000000-0000-0000-0000-000000000055', 'agency_member');

create temp table _t (seq int, line text);
select plan(13);

-- All calls are made by the actor (agency A member).
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000055","role":"authenticated"}';

-- (a) a single-channel post cannot be split
insert into _t select 1, throws_ok(
  $$ select public.split_post_channel('e1000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055') $$,
  'P0001'
);

-- (b) a channel that isn't on the post is rejected (c3 is a channel of C, not on P2)
insert into _t select 2, throws_ok(
  $$ select public.split_post_channel('e2000000-0000-0000-0000-000000000055', 'c3000000-0000-0000-0000-000000000055') $$,
  'P0001'
);

-- ===== happy path: split c1 (P2's primary) off the two-channel post =====
create temp table _r as
  select public.split_post_channel('e2000000-0000-0000-0000-000000000055', 'c1000000-0000-0000-0000-000000000055') as result;

-- (c) the new post is a DRAFT
insert into _t select 3, is(
  (select status::text from public.content_item where id = (select (result->>'new_item_id')::uuid from _r)),
  'draft', 'split creates a draft post'
);

-- (c) it copied the original's body…
insert into _t select 4, is(
  (select cv.body from public.content_version cv
     join public.content_item ci on ci.current_version_id = cv.id
    where ci.id = (select (result->>'new_item_id')::uuid from _r)),
  'Caption X', 'split copies the caption (body)'
);

-- (c) …and visual_content
insert into _t select 5, is(
  (select cv.visual_content from public.content_version cv
     join public.content_item ci on ci.current_version_id = cv.id
    where ci.id = (select (result->>'new_item_id')::uuid from _r)),
  'Visual Y', 'split copies the visual content'
);

-- (c) the new post's primary channel is the split-off channel (c1)
insert into _t select 6, is(
  (select channel_id from public.content_item where id = (select (result->>'new_item_id')::uuid from _r)),
  'c1000000-0000-0000-0000-000000000055'::uuid, 'the new post''s channel is the split-off one'
);

-- (c) and it has exactly one channel link
insert into _t select 7, is(
  (select count(*)::int from public.content_item_channel where content_item_id = (select (result->>'new_item_id')::uuid from _r)),
  1, 'the new post is single-channel'
);

-- (c) the original lost that channel — down to one
insert into _t select 8, is(
  (select count(*)::int from public.content_item_channel where content_item_id = 'e2000000-0000-0000-0000-000000000055'),
  1, 'the original lost the split-off channel'
);

-- (c) the original kept its status
insert into _t select 9, is(
  (select status::text from public.content_item where id = 'e2000000-0000-0000-0000-000000000055'),
  'client_review', 'the original keeps its status'
);

-- (c) both rows share the same non-null post_group_id
insert into _t select 10, is(
  (select (ci.post_group_id is not null
           and ci.post_group_id = (select post_group_id from public.content_item where id = 'e2000000-0000-0000-0000-000000000055'))
     from public.content_item ci where ci.id = (select (result->>'new_item_id')::uuid from _r)),
  true, 'siblings share a non-null post_group_id'
);

-- (d) the original's channel_id no longer points at the split-off channel (repointed to c2)
insert into _t select 11, is(
  (select channel_id from public.content_item where id = 'e2000000-0000-0000-0000-000000000055'),
  'c2000000-0000-0000-0000-000000000055'::uuid, 'the original''s primary channel was repointed off the split channel'
);

-- (e) media cloned onto the new version, same count, all with NEW storage_paths
insert into _t select 12, is(
  (select count(*)::int from public.media
    where version_id = (select current_version_id from public.content_item where id = (select (result->>'new_item_id')::uuid from _r))
      and storage_path not in (select storage_path from public.media where version_id = 'f2000000-0000-0000-0000-000000000055')),
  2, 'media cloned onto the new version with new storage paths'
);

-- (e) the returned media array length matches
insert into _t select 13, is(
  (select jsonb_array_length(result->'media') from _r),
  2, 'the returned media array length matches the cloned count'
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

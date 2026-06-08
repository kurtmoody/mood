-- Migration 0015 — Row Level Security read floor for the content tables.
--
-- Database-enforced visibility (NOT a query filter): agency users see all of
-- their clients' content; client-role users (client_approver, client_viewer)
-- see ONLY their own client's posts, and ONLY once a post has reached the
-- client — status in (client_review, changes_requested, approved, scheduled,
-- posted). Never draft or internal_review.
--
-- This is the security floor under the SECURITY DEFINER write RPCs.

-- ---------- helper: is the current user a client-role user? ----------
-- True iff they hold a client-scope membership and NO agency membership.
create or replace function public.is_client_user()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.membership m
     where m.user_id = (select auth.uid())
       and m.scope_type = 'client'
  )
  and not exists (
    select 1 from public.membership m
     where m.user_id = (select auth.uid())
       and m.scope_type = 'agency'
  );
$$;

-- ---------- enable RLS (idempotent) ----------
alter table public.content_item    enable row level security;
alter table public.content_version enable row level security;
alter table public.approval_event  enable row level security;
alter table public.comment         enable row level security;
alter table public.channel         enable row level security;

-- ---------- replace the permissive read policies with status-aware ones ----------
-- The original schema's *_read policies let anyone who could see the client read
-- EVERY status (incl. draft / internal_review). They MUST be dropped: multiple
-- permissive SELECT policies are OR'd, so a stricter new policy alongside the old
-- one would have no effect.

-- content_item
drop policy if exists ci_read on public.content_item;
drop policy if exists content_item_select on public.content_item;
create policy content_item_select on public.content_item
  for select to authenticated
  using (
    public.is_agency_for_client(client_id)
    or (
      (select public.is_client_user())
      and client_id in (select public.client_ids_for_user())
      and status in ('client_review','changes_requested','approved','scheduled','posted')
    )
  );

-- content_version — a client must never read a version of a draft / internal post
drop policy if exists cv_read on public.content_version;
drop policy if exists content_version_select on public.content_version;
create policy content_version_select on public.content_version
  for select to authenticated
  using (
    exists (
      select 1 from public.content_item ci
       where ci.id = content_version.content_item_id
         and (
           public.is_agency_for_client(ci.client_id)
           or (
             (select public.is_client_user())
             and ci.client_id in (select public.client_ids_for_user())
             and ci.status in ('client_review','changes_requested','approved','scheduled','posted')
           )
         )
    )
  );

-- approval_event
drop policy if exists ae_read on public.approval_event;
drop policy if exists approval_event_select on public.approval_event;
create policy approval_event_select on public.approval_event
  for select to authenticated
  using (
    exists (
      select 1 from public.content_item ci
       where ci.id = approval_event.content_item_id
         and (
           public.is_agency_for_client(ci.client_id)
           or (
             (select public.is_client_user())
             and ci.client_id in (select public.client_ids_for_user())
             and ci.status in ('client_review','changes_requested','approved','scheduled','posted')
           )
         )
    )
  );

-- comment
drop policy if exists comment_read on public.comment;
drop policy if exists comment_select on public.comment;
create policy comment_select on public.comment
  for select to authenticated
  using (
    exists (
      select 1 from public.content_item ci
       where ci.id = comment.content_item_id
         and (
           public.is_agency_for_client(ci.client_id)
           or (
             (select public.is_client_user())
             and ci.client_id in (select public.client_ids_for_user())
             and ci.status in ('client_review','changes_requested','approved','scheduled','posted')
           )
         )
    )
  );

-- channel — visible to anyone who can see the client (agency or client), all roles.
drop policy if exists channel_read on public.channel;
drop policy if exists channel_select on public.channel;
create policy channel_select on public.channel
  for select to authenticated
  using (client_id in (select public.client_ids_for_user()));

-- ---------- indexes for the columns these policies filter on ----------
create index if not exists idx_content_item_client_id       on public.content_item (client_id);
create index if not exists idx_content_item_status          on public.content_item (status);
create index if not exists idx_content_version_content_item on public.content_version (content_item_id);
create index if not exists idx_approval_event_content_item  on public.approval_event (content_item_id);
create index if not exists idx_comment_content_item         on public.comment (content_item_id);
create index if not exists idx_channel_client_id            on public.channel (client_id);

-- ---------- writes are RPC-only — do NOT add write policies ----------
-- All writes go through SECURITY DEFINER RPCs (create_post, update_post,
-- transition_post, add_comment, delete_comment, add_channel, …). Those run as the
-- function owner, which BYPASSES RLS, so no INSERT/UPDATE/DELETE policy is needed
-- here and none should be added: without one, neither agency nor client users have
-- a direct write path. (Heads-up: the original schema's content_item.ci_write and
-- comment.comment_insert policies still grant some direct writes — review/remove
-- separately if you want writes strictly RPC-only.)

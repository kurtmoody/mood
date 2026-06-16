-- Migration 0053 — @mentions on comments and internal notes.
--
-- A mention is a structured row (not parsed from text) created inside the existing write
-- RPCs (add_comment / add_internal_note), which then fire a notification via the existing
-- _notify (post context) / _notify_task (task context) helpers — so mentions reuse the
-- bell and the live email path with NO edge-function change. type = 'mention'.
--
-- Visibility rule enforced IN the RPC (not just UI):
--   * internal-note mentions  → ONLY agency members of the note's agency (never a client
--     contact — that would notify a client about a note they can't see),
--   * comment mentions        → agency members of the post's agency OR portal users of the
--     post's client.
--
-- Backward-compatible: p_mentions defaults to '{}', so existing callers are unaffected until
-- the UI passes mentions. Both functions recreate their LATEST body verbatim (add_comment from
-- 0023 — keeping the comment-notification emit; add_internal_note from 0039) and only append
-- the mention block. Duplicate-function trap respected: each changed signature is dropped by
-- its exact old arg list, then the full current body recreated + the new param.

-- ---------- 1. mention table (structured rows; write-only audit in v1) ----------
create table if not exists public.mention (
  id                uuid primary key default gen_random_uuid(),
  source_type       text not null check (source_type in ('comment','internal_note')),
  source_id         uuid not null,                                  -- comment.id or internal_note.id (polymorphic, no FK)
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (source_type, source_id, mentioned_user_id)
);
create index if not exists idx_mention_source on public.mention (source_type, source_id);
create index if not exists idx_mention_user   on public.mention (mentioned_user_id);

alter table public.mention enable row level security;
-- No read policy in v1: mention rows are write-only audit. The UI renders @names from the
-- comment/note text and notifies via the notification table, so nothing reads these via the
-- API yet. Writes are RPC-only (SECURITY DEFINER bypasses RLS). Add a scoped read policy when
-- a feature needs to read them.

-- ---------- 2. add_comment (latest body = 0023) — append p_mentions ----------
drop function if exists public.add_comment(uuid, text);

create function public.add_comment(
  p_item_id  uuid,
  p_body     text,
  p_mentions uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_client      uuid;
  v_status      public.content_status;
  v_is_agency   boolean;
  v_is_client   boolean;
  v_id          uuid;
  v_title       text;
  v_client_name text;
  v_agency      uuid;
  v_targets     uuid[];
  u             uuid;
begin
  if auth.uid() is null then raise exception 'add_comment: not authenticated'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'add_comment: empty comment'; end if;

  select client_id, status, title into v_client, v_status, v_title
    from public.content_item where id = p_item_id;
  if v_client is null then raise exception 'add_comment: post not found'; end if;

  if v_client not in (select public.client_ids_for_user()) then
    raise exception 'add_comment: not authorised';
  end if;

  insert into public.comment (content_item_id, author_id, body)
  values (p_item_id, auth.uid(), p_body)
  returning id into v_id;

  -- ---- notifications: agency comment on a client-visible post → portal; client comment → agency ----
  v_is_agency := public.is_agency_for_client(v_client);
  v_is_client := exists (
    select 1 from public.membership m
     where m.user_id = auth.uid() and m.scope_type = 'client' and m.scope_id = v_client
  );

  select name into v_client_name from public.client where id = v_client;

  if v_is_agency and v_status in ('client_review','changes_requested','approved','scheduled','posted') then
    perform public._notify(public._portal_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": new comment — ' || left(btrim(p_body), 120));
  elsif v_is_client then
    perform public._notify(public._agency_user_ids_for_client(v_client),
      'comment', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": new comment — ' || left(btrim(p_body), 120));
  end if;

  -- ---- @mentions (0053): optional; an empty/null p_mentions is a complete no-op ----
  if p_mentions is not null and array_length(p_mentions, 1) is not null then
    -- Resolve the post's agency, for the mention access check.
    select agency_id into v_agency from public.client where id = v_client;

    -- Each target must have access to THIS post: an agency member of the post's agency, or a
    -- portal user of the post's client. Anything else is a stranger / cross-tenant — rejected.
    foreach u in array p_mentions loop
      if u is null then continue; end if;
      if not exists (
        select 1 from public.membership m
         where m.user_id = u
           and ((m.scope_type = 'agency' and m.scope_id = v_agency)
             or (m.scope_type = 'client' and m.scope_id = v_client))
      ) then
        raise exception 'add_comment: cannot mention a user without access to this post';
      end if;
      insert into public.mention (source_type, source_id, mentioned_user_id, created_by)
      values ('comment', v_id, u, auth.uid())
      on conflict (source_type, source_id, mentioned_user_id) do nothing;
    end loop;

    select array_agg(distinct t) into v_targets
      from unnest(p_mentions) as t where t is not null;

    perform public._notify(
      v_targets, 'mention', p_item_id, auth.uid(),
      coalesce(v_client_name, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": you were mentioned in a comment');
  end if;

  return v_id;
end; $$;

-- ---------- 3. add_internal_note (latest body = 0039) — append p_mentions ----------
drop function if exists public.add_internal_note(text, uuid, text);

create function public.add_internal_note(
  p_parent_type text,
  p_parent_id   uuid,
  p_body        text,
  p_mentions    uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_agency  uuid;
  v_id      uuid;
  v_title   text;
  v_cname   text;
  v_targets uuid[];
  u         uuid;
begin
  if v_uid is null then raise exception 'add_internal_note: not authenticated'; end if;
  if p_parent_type not in ('post','task') then
    raise exception 'add_internal_note: invalid parent_type %', p_parent_type;
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'add_internal_note: body is required';
  end if;

  -- Resolve the parent's agency (no FK — must look it up by type).
  if p_parent_type = 'post' then
    select c.agency_id into v_agency
      from public.content_item ci
      join public.client c on c.id = ci.client_id
     where ci.id = p_parent_id;
  else
    select agency_id into v_agency from public.task where id = p_parent_id;
  end if;
  if v_agency is null then raise exception 'add_internal_note: parent not found'; end if;
  if not public.is_agency_member(v_agency) then
    raise exception 'add_internal_note: not authorised';
  end if;

  insert into public.internal_note (parent_type, parent_id, author_id, body)
  values (p_parent_type, p_parent_id, v_uid, btrim(p_body))
  returning id into v_id;

  -- ---- @mentions (0053): internal notes may ONLY mention agency members of the parent's
  -- agency — never a client contact (that would notify a client about a note they can't see).
  -- Empty/null p_mentions is a complete no-op.
  if p_mentions is not null and array_length(p_mentions, 1) is not null then
    -- Title (+ client name for posts) for the notice.
    if p_parent_type = 'post' then
      select c.name, ci.title into v_cname, v_title
        from public.content_item ci
        join public.client c on c.id = ci.client_id
       where ci.id = p_parent_id;
    else
      select title into v_title from public.task where id = p_parent_id;
    end if;

    foreach u in array p_mentions loop
      if u is null then continue; end if;
      if not exists (
        select 1 from public.membership m
         where m.user_id = u
           and m.scope_type = 'agency'
           and m.scope_id = v_agency
      ) then
        raise exception 'add_internal_note: can only mention agency team members';
      end if;
      insert into public.mention (source_type, source_id, mentioned_user_id, created_by)
      values ('internal_note', v_id, u, v_uid)
      on conflict (source_type, source_id, mentioned_user_id) do nothing;
    end loop;

    select array_agg(distinct t) into v_targets
      from unnest(p_mentions) as t where t is not null;

    if p_parent_type = 'post' then
      perform public._notify(
        v_targets, 'mention', p_parent_id, v_uid,
        coalesce(v_cname, 'A client') || ' — "' || coalesce(v_title, 'a post') || '": you were mentioned in an internal note');
    else
      perform public._notify_task(
        v_targets, 'mention', p_parent_id, v_uid,
        '"' || coalesce(v_title, 'a task') || '": you were mentioned in an internal note',
        true);
    end if;
  end if;

  return v_id;
end; $$;

-- ---------- 4. refresh the PostgREST schema cache ----------
notify pgrst, 'reload schema';

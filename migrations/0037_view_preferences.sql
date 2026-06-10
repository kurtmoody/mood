-- Migration 0037 — per-user view preferences (column hide/show/reorder).
--
-- Display-only personalisation, keyed by a view_key (e.g. 'tasks'). config is an ordered
-- JSON array of {key, hidden}. The mechanism is view-agnostic: any table-ish view can
-- adopt it by picking a view_key and declaring its columns in code.
--
-- This is a personal-preferences table: each user only ever sees/writes their OWN rows
-- (RLS: user_id = auth.uid()). Writes still go through a SECURITY DEFINER upsert RPC to
-- stay consistent with the RPC-only-writes convention; the only auth check is "logged in".

create table if not exists public.user_view_preference (
  user_id    uuid not null references auth.users(id) on delete cascade,
  view_key   text not null,
  config     jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, view_key)
);

alter table public.user_view_preference enable row level security;

-- Own-rows-only for both read and write.
drop policy if exists user_view_preference_rw on public.user_view_preference;
create policy user_view_preference_rw on public.user_view_preference
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Upsert the caller's own preference. No admin gate — it's their own setting.
create or replace function public.set_view_preference(p_view_key text, p_config jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'set_view_preference: not authenticated'; end if;
  if p_view_key is null or btrim(p_view_key) = '' then
    raise exception 'set_view_preference: view_key is required';
  end if;
  -- config must be a JSON array (the ordered column list).
  if p_config is null or jsonb_typeof(p_config) <> 'array' then
    raise exception 'set_view_preference: config must be a JSON array';
  end if;

  insert into public.user_view_preference (user_id, view_key, config, updated_at)
  values (v_uid, p_view_key, p_config, now())
  on conflict (user_id, view_key) do update
    set config = excluded.config, updated_at = now();
end; $$;

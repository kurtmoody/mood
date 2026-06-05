-- Migration 0005 — team directory (internal agency staff)
create table if not exists public.team_member (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agency(id) on delete cascade,
  full_name   text not null,
  role        text,
  email       text,
  user_id     uuid references auth.users(id) on delete set null,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create or replace function public.is_agency_member(a uuid)
returns boolean
language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.membership m
     where m.user_id = auth.uid()
       and m.scope_type = 'agency'
       and m.scope_id = a
  );
$$;

alter table public.team_member enable row level security;

drop policy if exists team_member_read on public.team_member;
create policy team_member_read on public.team_member
  for select using (public.is_agency_member(agency_id));

create or replace function public.add_team_member(
  p_full_name text, p_role text default null, p_email text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'add_team_member: not authenticated'; end if;
  select m.scope_id into v_agency from public.membership m
   where m.user_id = v_uid and m.scope_type='agency' and m.role in ('agency_admin','agency_member')
   order by m.created_at limit 1;
  if v_agency is null then raise exception 'add_team_member: no agency admin/member membership'; end if;
  insert into public.team_member (agency_id, full_name, role, email)
  values (v_agency, p_full_name, p_role, p_email) returning id into v_id;
  return v_id;
end; $$;

insert into public.team_member (agency_id, full_name, role, email, user_id)
select '00000000-0000-0000-0000-000000000001', 'Kurt Hili', 'Founder', u.email, u.id
from auth.users u
where u.email = 'kurt@mood.mt'
  and not exists (select 1 from public.team_member t where t.user_id = u.id);

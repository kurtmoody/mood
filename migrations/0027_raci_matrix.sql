-- Migration 0027 — RACI matrix as reference data (Slice 1, Part B).
--
-- Agency-scoped reference grid: per task_type, each team member's RACI value
-- (A/R/C/I). Read-only to agency members of that agency; no write policies (future
-- edits, if any, go via an RPC). No app UI in this slice.

-- ---------- table ----------
create table if not exists public.raci_matrix (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agency(id),
  task_type      text not null,
  team_member_id uuid not null references public.team_member(id) on delete cascade,
  raci_value     text not null,
  created_at     timestamptz default now(),
  constraint uq_raci_cell unique (agency_id, task_type, team_member_id)
);

-- ---------- RLS: agency-scoped read, no writes ----------
alter table public.raci_matrix enable row level security;

drop policy if exists raci_matrix_read on public.raci_matrix;
create policy raci_matrix_read on public.raci_matrix
  for select using (public.is_agency_member(agency_id));
-- No insert/update/delete policies: reference data; edits (if ever) via a SECURITY DEFINER RPC.

-- ========================================================================
-- SEED — Mood Agency (00000000-0000-0000-0000-000000000001)
-- ========================================================================

-- Guard: every referenced person must already exist in team_member for this
-- agency. If any is missing, fail loudly (rather than silently seeding nothing).
do $$
declare
  v_agency  uuid := '00000000-0000-0000-0000-000000000001';
  v_missing text;
begin
  select string_agg(req.n, ', ' order by req.n) into v_missing
    from (values ('Kurt Hili'),('Sandrina'),('Tiffany'),('Michelle'),('Aiden'),('Design Intern'),('Marketing Intern')) as req(n)
   where not exists (
     select 1 from public.team_member tm
      where tm.agency_id = v_agency and tm.full_name = req.n
   );
  if v_missing is not null then
    raise exception 'raci seed: missing team_member full_name(s) for Mood Agency: %', v_missing;
  end if;
end $$;

-- Each non-blank cell, resolved to team_member.id by full_name within the agency.
-- Idempotent via the unique (agency_id, task_type, team_member_id).
insert into public.raci_matrix (agency_id, task_type, team_member_id, raci_value)
select '00000000-0000-0000-0000-000000000001', g.task_type, tm.id, g.raci_value
  from (values
    ('New lead / client intake',                    'Kurt Hili',        'A'),
    ('New lead / client intake',                    'Sandrina',         'I'),
    ('New lead / client intake',                    'Tiffany',          'C'),
    ('New lead / client intake',                    'Michelle',         'I'),
    ('New lead / client intake',                    'Aiden',            'I'),
    ('New lead / client intake',                    'Design Intern',    'I'),
    ('New lead / client intake',                    'Marketing Intern', 'I'),

    ('Scope / quote / contract or retainer change', 'Kurt Hili',        'A/R'),
    ('Scope / quote / contract or retainer change', 'Sandrina',         'C'),
    ('Scope / quote / contract or retainer change', 'Tiffany',          'C'),
    ('Scope / quote / contract or retainer change', 'Michelle',         'I'),
    ('Scope / quote / contract or retainer change', 'Aiden',            'I'),
    ('Scope / quote / contract or retainer change', 'Design Intern',    'I'),
    ('Scope / quote / contract or retainer change', 'Marketing Intern', 'I'),

    ('Client relationship / main communication',    'Kurt Hili',        'C'),
    ('Client relationship / main communication',    'Sandrina',         'I'),
    ('Client relationship / main communication',    'Tiffany',          'A/R'),
    ('Client relationship / main communication',    'Michelle',         'R'),
    ('Client relationship / main communication',    'Aiden',            'I'),
    ('Client relationship / main communication',    'Design Intern',    'I'),
    ('Client relationship / main communication',    'Marketing Intern', 'I'),

    ('Content strategy / monthly plan',             'Kurt Hili',        'C'),
    ('Content strategy / monthly plan',             'Sandrina',         'C'),
    ('Content strategy / monthly plan',             'Tiffany',          'A/R'),
    ('Content strategy / monthly plan',             'Michelle',         'R'),
    ('Content strategy / monthly plan',             'Aiden',            'C'),
    ('Content strategy / monthly plan',             'Design Intern',    'I'),
    ('Content strategy / monthly plan',             'Marketing Intern', 'S'),

    ('Caption writing / copy',                      'Kurt Hili',        'I'),
    ('Caption writing / copy',                      'Sandrina',         'C'),
    ('Caption writing / copy',                      'Tiffany',          'A'),
    ('Caption writing / copy',                      'Michelle',         'R'),
    ('Caption writing / copy',                      'Aiden',            'I'),
    ('Caption writing / copy',                      'Design Intern',    'I'),
    ('Caption writing / copy',                      'Marketing Intern', 'S'),

    ('Design direction',                            'Kurt Hili',        'I'),
    ('Design direction',                            'Sandrina',         'A/R'),
    ('Design direction',                            'Tiffany',          'C'),
    ('Design direction',                            'Michelle',         'C'),
    ('Design direction',                            'Aiden',            'I'),
    ('Design direction',                            'Design Intern',    'S'),
    ('Design direction',                            'Marketing Intern', 'I'),

    ('Design execution',                            'Kurt Hili',        'I'),
    ('Design execution',                            'Sandrina',         'A'),
    ('Design execution',                            'Tiffany',          'C'),
    ('Design execution',                            'Michelle',         'C'),
    ('Design execution',                            'Aiden',            'I'),
    ('Design execution',                            'Design Intern',    'R'),
    ('Design execution',                            'Marketing Intern', 'I'),

    ('Video concept / shot list',                   'Kurt Hili',        'I'),
    ('Video concept / shot list',                   'Sandrina',         'C'),
    ('Video concept / shot list',                   'Tiffany',          'A/R'),
    ('Video concept / shot list',                   'Michelle',         'R'),
    ('Video concept / shot list',                   'Aiden',            'C'),
    ('Video concept / shot list',                   'Design Intern',    'I'),
    ('Video concept / shot list',                   'Marketing Intern', 'S'),

    ('Filming / content capture',                   'Kurt Hili',        'I'),
    ('Filming / content capture',                   'Sandrina',         'C'),
    ('Filming / content capture',                   'Tiffany',          'C'),
    ('Filming / content capture',                   'Michelle',         'S'),
    ('Filming / content capture',                   'Aiden',            'A/R'),
    ('Filming / content capture',                   'Design Intern',    'I'),
    ('Filming / content capture',                   'Marketing Intern', 'I'),

    ('Video editing / reels',                       'Kurt Hili',        'I'),
    ('Video editing / reels',                       'Sandrina',         'C'),
    ('Video editing / reels',                       'Tiffany',          'C'),
    ('Video editing / reels',                       'Michelle',         'S'),
    ('Video editing / reels',                       'Aiden',            'A/R'),
    ('Video editing / reels',                       'Design Intern',    'I'),
    ('Video editing / reels',                       'Marketing Intern', 'I'),

    ('Scheduling / publishing',                     'Kurt Hili',        'I'),
    ('Scheduling / publishing',                     'Sandrina',         'I'),
    ('Scheduling / publishing',                     'Tiffany',          'A'),
    ('Scheduling / publishing',                     'Michelle',         'R'),
    ('Scheduling / publishing',                     'Aiden',            'I'),
    ('Scheduling / publishing',                     'Design Intern',    'I'),
    ('Scheduling / publishing',                     'Marketing Intern', 'S'),

    ('Paid ads setup / boost coordination',         'Kurt Hili',        'A'),
    ('Paid ads setup / boost coordination',         'Sandrina',         'C'),
    ('Paid ads setup / boost coordination',         'Tiffany',          'R'),
    ('Paid ads setup / boost coordination',         'Michelle',         'S'),
    ('Paid ads setup / boost coordination',         'Aiden',            'I'),
    ('Paid ads setup / boost coordination',         'Design Intern',    'I'),
    ('Paid ads setup / boost coordination',         'Marketing Intern', 'I'),

    ('Client feedback / revisions',                 'Kurt Hili',        'C'),
    ('Client feedback / revisions',                 'Sandrina',         'A/R'),
    ('Client feedback / revisions',                 'Tiffany',          'A/R'),
    ('Client feedback / revisions',                 'Michelle',         'R'),
    ('Client feedback / revisions',                 'Aiden',            'R'),
    ('Client feedback / revisions',                 'Design Intern',    'S'),
    ('Client feedback / revisions',                 'Marketing Intern', 'S'),

    ('Final approval before client sees work',      'Kurt Hili',        'C'),
    ('Final approval before client sees work',      'Sandrina',         'A/R'),
    ('Final approval before client sees work',      'Tiffany',          'A/R'),
    ('Final approval before client sees work',      'Michelle',         'C'),
    ('Final approval before client sees work',      'Aiden',            'C'),
    ('Final approval before client sees work',      'Design Intern',    'I'),
    ('Final approval before client sees work',      'Marketing Intern', 'I'),

    ('Reporting / performance updates',             'Kurt Hili',        'C'),
    ('Reporting / performance updates',             'Sandrina',         'I'),
    ('Reporting / performance updates',             'Tiffany',          'A/R'),
    ('Reporting / performance updates',             'Michelle',         'S'),
    ('Reporting / performance updates',             'Aiden',            'I'),
    ('Reporting / performance updates',             'Design Intern',    'I'),
    ('Reporting / performance updates',             'Marketing Intern', 'S')
  ) as g(task_type, full_name, raci_value)
  join public.team_member tm
    on tm.agency_id = '00000000-0000-0000-0000-000000000001'
   and tm.full_name = g.full_name
on conflict (agency_id, task_type, team_member_id) do nothing;

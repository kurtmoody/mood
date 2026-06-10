-- Migration 0046 — flat agency cost-per-hour (reporting hub, piece 2): the cost input.
--
-- Sensitive internal cost data → admin-gated (like set_member_role/set_raci_matrix).
-- The cost side of the profitability hub (job value − time-cost). NO reporting here.

alter table public.agency add column if not exists cost_per_hour numeric;

-- ---------- set_agency_cost_per_hour (agency_admin only) ----------
create or replace function public.set_agency_cost_per_hour(p_agency_id uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'set_agency_cost_per_hour: not authenticated'; end if;
  if p_rate is not null and p_rate < 0 then
    raise exception 'set_agency_cost_per_hour: rate must be >= 0';
  end if;
  if not exists (
    select 1 from public.membership m
     where m.user_id = v_uid and m.scope_type = 'agency' and m.scope_id = p_agency_id and m.role = 'agency_admin'
  ) then raise exception 'set_agency_cost_per_hour: not authorised'; end if;

  update public.agency set cost_per_hour = p_rate where id = p_agency_id;
end; $$;

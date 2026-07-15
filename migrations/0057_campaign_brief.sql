-- Migration 0057 — campaign brief, budgets/fee, KPI targets, and the intake gate (slice 2).
--
-- Adds the brief-and-money layer to campaign: brief text, media_budget, fee (the fixed
-- campaign price — internal), and two KPI targets (results + cost-per-result). Plus the
-- brief-approval stamp (brief_approved_at / brief_approved_by) that gates production.
--
-- SEMANTICS (documented, so callers don't guess):
--   * brief / media_budget / fee / kpi_* follow the established FULL-OVERWRITE rule — the
--     edit form always sends the complete current state; a missing value writes null.
--   * phase alone PRESERVES when omitted (the 0050 update_client_preserve_status lesson) —
--     that rule is reproduced verbatim below and must survive this rebuild.
--   * approval is NOT settable through update_campaign — it has its own reversible RPC
--     (set_brief_approved) so an edit save can never silently (un)approve a brief.
--
-- THE INTAKE GATE: advancing a campaign INTO production / live / wrapped requires an approved
-- brief (brief_approved_at is not null) — raised loudly. planning → closed is never gated (an
-- abandoned campaign never needed a brief). Enforced in update_campaign's phase path (a genuine
-- transition only), and mirrored in create_campaign (a new row has no approved brief, so it
-- cannot START in a gated phase). See the header flag: a dedicated advance RPC would be a
-- cleaner home, but the gate lives with the phase logic per the brief.
--
-- create_campaign / update_campaign are rebuilt. Per the 0056 ledger lesson we drop BOTH the
-- old (0056) AND the new signatures first (duplicate-function trap; idempotent re-runs).

-- ---------- 1. columns ----------
alter table public.campaign add column if not exists brief                      text;
alter table public.campaign add column if not exists media_budget               numeric;
alter table public.campaign add column if not exists fee                        numeric;
alter table public.campaign add column if not exists kpi_target_results         numeric;
alter table public.campaign add column if not exists kpi_target_cost_per_result numeric;
alter table public.campaign add column if not exists brief_approved_at          timestamptz;
alter table public.campaign add column if not exists brief_approved_by          uuid;

-- Non-negative money/targets when present (defence-in-depth; the RPCs raise P0001 first).
alter table public.campaign drop constraint if exists campaign_money_nonneg;
alter table public.campaign add  constraint campaign_money_nonneg check (
      (media_budget               is null or media_budget               >= 0)
  and (fee                        is null or fee                        >= 0)
  and (kpi_target_results         is null or kpi_target_results         >= 0)
  and (kpi_target_cost_per_result is null or kpi_target_cost_per_result >= 0)
);

-- ---------- 2. create_campaign (0056 body + brief/money/targets + create-side gate) ----------
drop function if exists public.create_campaign(uuid, text, text, text, date, date);
drop function if exists public.create_campaign(uuid, text, text, text, date, date, text, numeric, numeric, numeric, numeric);

create function public.create_campaign(
  p_client_id                  uuid,
  p_name                       text,
  p_objective                  text default null,
  p_phase                      text default 'planning',
  p_start_date                 date default null,
  p_end_date                   date default null,
  p_brief                      text default null,
  p_media_budget               numeric default null,
  p_fee                        numeric default null,
  p_kpi_target_results         numeric default null,
  p_kpi_target_cost_per_result numeric default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_agency uuid; v_id uuid; v_phase text;
begin
  if v_uid is null then raise exception 'create_campaign: not authenticated'; end if;
  if not public.is_agency_for_client(p_client_id) then raise exception 'create_campaign: not authorised'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'create_campaign: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'create_campaign: invalid objective %', p_objective;
  end if;
  if p_media_budget is not null and p_media_budget < 0 then raise exception 'create_campaign: media_budget must be >= 0'; end if;
  if p_fee is not null and p_fee < 0 then raise exception 'create_campaign: fee must be >= 0'; end if;
  if p_kpi_target_results is not null and p_kpi_target_results < 0 then raise exception 'create_campaign: kpi_target_results must be >= 0'; end if;
  if p_kpi_target_cost_per_result is not null and p_kpi_target_cost_per_result < 0 then raise exception 'create_campaign: kpi_target_cost_per_result must be >= 0'; end if;
  v_phase := coalesce(nullif(btrim(p_phase), ''), 'planning');
  if v_phase not in ('planning','production','live','wrapped','closed') then
    raise exception 'create_campaign: invalid phase %', v_phase;
  end if;
  -- Intake gate (create side): a new campaign has no approved brief, so it cannot start
  -- in a gated phase. planning / closed are fine.
  if v_phase in ('production','live','wrapped') then
    raise exception 'create_campaign: approve the brief before production';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'create_campaign: start_date must be on or before end_date';
  end if;

  select c.agency_id into v_agency from public.client c where c.id = p_client_id;

  insert into public.campaign (agency_id, client_id, name, objective, phase, start_date, end_date,
                               brief, media_budget, fee, kpi_target_results, kpi_target_cost_per_result, created_by)
  values (v_agency, p_client_id, btrim(p_name), p_objective, v_phase, p_start_date, p_end_date,
          p_brief, p_media_budget, p_fee, p_kpi_target_results, p_kpi_target_cost_per_result, v_uid)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- 3. update_campaign (0056 body verbatim + brief/money/targets + intake gate) ----------
drop function if exists public.update_campaign(uuid, text, text, text, date, date);
drop function if exists public.update_campaign(uuid, text, text, text, date, date, text, numeric, numeric, numeric, numeric);

create function public.update_campaign(
  p_id                         uuid,
  p_name                       text,
  p_objective                  text default null,
  p_phase                      text default null,
  p_start_date                 date default null,
  p_end_date                   date default null,
  p_brief                      text default null,
  p_media_budget               numeric default null,
  p_fee                        numeric default null,
  p_kpi_target_results         numeric default null,
  p_kpi_target_cost_per_result numeric default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid; v_current_phase text; v_phase text; v_brief_approved timestamptz;
begin
  if auth.uid() is null then raise exception 'update_campaign: not authenticated'; end if;
  select client_id, phase, brief_approved_at into v_client, v_current_phase, v_brief_approved
    from public.campaign where id = p_id;
  if v_client is null then raise exception 'update_campaign: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'update_campaign: not authorised'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'update_campaign: name required'; end if;
  if p_objective is not null and p_objective not in ('awareness','traffic','leads','conversions','sales') then
    raise exception 'update_campaign: invalid objective %', p_objective;
  end if;
  if p_media_budget is not null and p_media_budget < 0 then raise exception 'update_campaign: media_budget must be >= 0'; end if;
  if p_fee is not null and p_fee < 0 then raise exception 'update_campaign: fee must be >= 0'; end if;
  if p_kpi_target_results is not null and p_kpi_target_results < 0 then raise exception 'update_campaign: kpi_target_results must be >= 0'; end if;
  if p_kpi_target_cost_per_result is not null and p_kpi_target_cost_per_result < 0 then raise exception 'update_campaign: kpi_target_cost_per_result must be >= 0'; end if;
  -- Preserve the current phase when none is supplied (0050 update_client_preserve_status
  -- lesson); only a genuinely-supplied value is whitelist-checked.
  v_phase := coalesce(nullif(btrim(p_phase), ''), v_current_phase);
  if nullif(btrim(p_phase), '') is not null and v_phase not in ('planning','production','live','wrapped','closed') then
    raise exception 'update_campaign: invalid phase %', v_phase;
  end if;
  -- Intake gate: advancing INTO production/live/wrapped needs an approved brief. A genuine
  -- transition only — an unchanged phase (field edits) and planning → closed are never gated.
  if v_phase is distinct from v_current_phase
     and v_phase in ('production','live','wrapped')
     and v_brief_approved is null then
    raise exception 'update_campaign: approve the brief before production';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'update_campaign: start_date must be on or before end_date';
  end if;

  update public.campaign set
    name = btrim(p_name), objective = p_objective, phase = v_phase,
    start_date = p_start_date, end_date = p_end_date,
    brief = p_brief, media_budget = p_media_budget, fee = p_fee,
    kpi_target_results = p_kpi_target_results, kpi_target_cost_per_result = p_kpi_target_cost_per_result,
    updated_at = now()
  where id = p_id;
  -- NB: brief_approved_at / brief_approved_by are intentionally NOT touched here — see set_brief_approved.
end; $$;

-- ---------- 4. set_brief_approved — the reversible approval stamp (agency-member level) ----------
create or replace function public.set_brief_approved(p_id uuid, p_approved boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_client uuid;
begin
  if v_uid is null then raise exception 'set_brief_approved: not authenticated'; end if;
  select client_id into v_client from public.campaign where id = p_id;
  if v_client is null then raise exception 'set_brief_approved: campaign not found'; end if;
  if not public.is_agency_for_client(v_client) then raise exception 'set_brief_approved: not authorised'; end if;

  -- Approving stamps who/when; un-approving nulls both (mistakes happen — keep it reversible).
  update public.campaign set
    brief_approved_at = case when p_approved then now()  else null end,
    brief_approved_by = case when p_approved then v_uid  else null end,
    updated_at        = now()
  where id = p_id;
end; $$;

'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_PHASES, type CampaignObjective, type CampaignPhase } from '@/lib/campaignConstants'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type CampaignState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

function num(fd: FormData, k: string): number | null {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// The brief/money/target fields — sent whole on every write (documented full-overwrite).
function briefParams(fd: FormData) {
  return {
    p_brief: str(fd, 'brief'),
    p_media_budget: num(fd, 'media_budget'),
    p_fee: num(fd, 'fee'),
    p_kpi_target_results: num(fd, 'kpi_target_results'),
    p_kpi_target_cost_per_result: num(fd, 'kpi_target_cost_per_result'),
  }
}

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

function objective(fd: FormData): { value: string | null; valid: boolean } {
  const v = str(fd, 'objective')
  return { value: v, valid: v === null || CAMPAIGN_OBJECTIVES.includes(v as CampaignObjective) }
}

function phase(fd: FormData): { value: string; valid: boolean } {
  const v = str(fd, 'phase') ?? 'planning'
  return { value: v, valid: CAMPAIGN_PHASES.includes(v as CampaignPhase) }
}

export async function createCampaignAction(_prev: CampaignState, fd: FormData): Promise<CampaignState> {
  const supabase = await authed()
  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }
  const name = str(fd, 'name')
  if (!name) return { error: 'Name is required.', ok: false }
  const obj = objective(fd)
  if (!obj.valid) return { error: 'Choose a valid objective.', ok: false }
  const ph = phase(fd)
  if (!ph.valid) return { error: 'Choose a valid phase.', ok: false }

  const { error } = await supabase.rpc('create_campaign', {
    p_client_id: clientId,
    p_name: name,
    p_objective: obj.value,
    p_phase: ph.value,
    p_start_date: str(fd, 'start_date'),
    p_end_date: str(fd, 'end_date'),
    ...briefParams(fd),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function updateCampaignAction(_prev: CampaignState, fd: FormData): Promise<CampaignState> {
  const supabase = await authed()
  const id = str(fd, 'campaign_id')
  if (!id) return { error: 'Missing campaign id.', ok: false }
  const name = str(fd, 'name')
  if (!name) return { error: 'Name is required.', ok: false }
  const obj = objective(fd)
  if (!obj.valid) return { error: 'Choose a valid objective.', ok: false }
  const ph = phase(fd)
  if (!ph.valid) return { error: 'Choose a valid phase.', ok: false }

  const { error } = await supabase.rpc('update_campaign', {
    p_id: id,
    p_name: name,
    p_objective: obj.value,
    p_phase: ph.value,
    p_start_date: str(fd, 'start_date'),
    p_end_date: str(fd, 'end_date'),
    ...briefParams(fd),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  const clientId = str(fd, 'client_id')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/campaigns/${id}`)
  return { error: null, ok: true }
}

// Direct-call (no form) — used by the hub's phase-advance control. update_campaign is
// full-overwrite, so we forward the WHOLE current field set (incl. brief/money/targets),
// changing only the phase — otherwise advancing would wipe the brief.
export async function setCampaignPhaseAction(
  campaignId: string,
  next: {
    name: string
    objective: string | null
    phase: string
    start_date: string | null
    end_date: string | null
    brief: string | null
    media_budget: number | null
    fee: number | null
    kpi_target_results: number | null
    kpi_target_cost_per_result: number | null
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!CAMPAIGN_PHASES.includes(next.phase as CampaignPhase)) return { error: 'Invalid phase.' }

  const { error } = await supabase.rpc('update_campaign', {
    p_id: campaignId,
    p_name: next.name,
    p_objective: next.objective,
    p_phase: next.phase,
    p_start_date: next.start_date,
    p_end_date: next.end_date,
    p_brief: next.brief,
    p_media_budget: next.media_budget,
    p_fee: next.fee,
    p_kpi_target_results: next.kpi_target_results,
    p_kpi_target_cost_per_result: next.kpi_target_cost_per_result,
  })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null }
}

// Reversible brief approval — the intake gate for production. Agency-member level (RPC-enforced).
export async function setBriefApprovedAction(campaignId: string, approved: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('set_brief_approved', { p_id: campaignId, p_approved: approved })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null }
}

export async function deleteCampaignAction(_prev: CampaignState, fd: FormData): Promise<CampaignState> {
  const supabase = await authed()
  const id = str(fd, 'campaign_id')
  if (!id) return { error: 'Missing campaign id.', ok: false }

  const { error } = await supabase.rpc('delete_campaign', { p_id: id })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  const clientId = str(fd, 'client_id')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

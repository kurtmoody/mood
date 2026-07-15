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
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  const clientId = str(fd, 'client_id')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/campaigns/${id}`)
  return { error: null, ok: true }
}

// Direct-call (no form) — used by the hub's phase-advance control.
export async function setCampaignPhaseAction(
  campaignId: string,
  next: { name: string; objective: string | null; phase: string; start_date: string | null; end_date: string | null },
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
  })
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

'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type MilestoneState = { error: string | null; ok: boolean }

const STATUSES = ['upcoming', 'in_progress', 'done']

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

function status(fd: FormData): { value: string; valid: boolean } {
  const v = str(fd, 'status') ?? 'upcoming'
  return { value: v, valid: STATUSES.includes(v) }
}

export async function addMilestoneAction(_prev: MilestoneState, fd: FormData): Promise<MilestoneState> {
  const supabase = await authed()
  const campaignId = str(fd, 'campaign_id')
  if (!campaignId) return { error: 'Missing campaign id.', ok: false }
  const title = str(fd, 'title')
  if (!title) return { error: 'Title is required.', ok: false }
  const st = status(fd)
  if (!st.valid) return { error: 'Choose a valid status.', ok: false }

  const { error } = await supabase.rpc('create_campaign_milestone', {
    p_campaign_id: campaignId,
    p_title: title,
    p_start_date: str(fd, 'start_date'),
    p_end_date: str(fd, 'end_date'),
    p_status: st.value,
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

export async function updateMilestoneAction(_prev: MilestoneState, fd: FormData): Promise<MilestoneState> {
  const supabase = await authed()
  const id = str(fd, 'milestone_id')
  if (!id) return { error: 'Missing milestone id.', ok: false }
  const title = str(fd, 'title')
  if (!title) return { error: 'Title is required.', ok: false }
  const st = status(fd)
  if (!st.valid) return { error: 'Choose a valid status.', ok: false }

  const { error } = await supabase.rpc('update_campaign_milestone', {
    p_id: id,
    p_title: title,
    p_start_date: str(fd, 'start_date'),
    p_end_date: str(fd, 'end_date'),
    p_status: st.value,
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  const campaignId = str(fd, 'campaign_id')
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

export async function deleteMilestoneAction(_prev: MilestoneState, fd: FormData): Promise<MilestoneState> {
  const supabase = await authed()
  const id = str(fd, 'milestone_id')
  if (!id) return { error: 'Missing milestone id.', ok: false }

  const { error } = await supabase.rpc('delete_campaign_milestone', { p_id: id })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  const campaignId = str(fd, 'campaign_id')
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

// Up/down reorder — direct-call (array, not a form). Sends the full ordered id list.
export async function reorderMilestonesAction(campaignId: string, orderedIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('reorder_campaign_milestone', { p_campaign_id: campaignId, p_ordered_ids: orderedIds })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null }
}

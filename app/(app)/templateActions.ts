'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { CAMPAIGN_OBJECTIVES, type CampaignObjective } from '@/lib/campaignConstants'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type TemplateState = { error: string | null; ok: boolean }

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

function intOrNull(fd: FormData, k: string): number | null {
  const n = num(fd, k)
  return n == null ? null : Math.trunc(n)
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

// ---- template ----
export async function createTemplateAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const name = str(fd, 'name')
  if (!name) return { error: 'Name is required.', ok: false }
  const obj = objective(fd)
  if (!obj.valid) return { error: 'Choose a valid objective.', ok: false }

  const { error } = await supabase.rpc('create_campaign_template', { p_name: name, p_objective: obj.value })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

export async function updateTemplateAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const id = str(fd, 'template_id')
  if (!id) return { error: 'Missing template id.', ok: false }
  const name = str(fd, 'name')
  if (!name) return { error: 'Name is required.', ok: false }
  const obj = objective(fd)
  if (!obj.valid) return { error: 'Choose a valid objective.', ok: false }

  const { error } = await supabase.rpc('update_campaign_template', { p_id: id, p_name: name, p_objective: obj.value })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

export async function deleteTemplateAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const id = str(fd, 'template_id')
  if (!id) return { error: 'Missing template id.', ok: false }
  const { error } = await supabase.rpc('delete_campaign_template', { p_id: id })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

// ---- template task ----
export async function addTemplateTaskAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const templateId = str(fd, 'template_id')
  if (!templateId) return { error: 'Missing template id.', ok: false }
  const title = str(fd, 'title')
  if (!title) return { error: 'Title is required.', ok: false }

  const { error } = await supabase.rpc('create_campaign_template_task', {
    p_template_id: templateId,
    p_title: title,
    p_task_type: str(fd, 'task_type'),
    p_estimated_hours: num(fd, 'estimated_hours'),
    p_start_offset_days: intOrNull(fd, 'start_offset_days'),
    p_due_offset_days: intOrNull(fd, 'due_offset_days'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

export async function updateTemplateTaskAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const id = str(fd, 'task_id')
  if (!id) return { error: 'Missing task id.', ok: false }
  const title = str(fd, 'title')
  if (!title) return { error: 'Title is required.', ok: false }

  const { error } = await supabase.rpc('update_campaign_template_task', {
    p_id: id,
    p_title: title,
    p_task_type: str(fd, 'task_type'),
    p_estimated_hours: num(fd, 'estimated_hours'),
    p_start_offset_days: intOrNull(fd, 'start_offset_days'),
    p_due_offset_days: intOrNull(fd, 'due_offset_days'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

export async function deleteTemplateTaskAction(_prev: TemplateState, fd: FormData): Promise<TemplateState> {
  const supabase = await authed()
  const id = str(fd, 'task_id')
  if (!id) return { error: 'Missing task id.', ok: false }
  const { error } = await supabase.rpc('delete_campaign_template_task', { p_id: id })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath('/templates')
  return { error: null, ok: true }
}

export async function reorderTemplateTasksAction(templateId: string, orderedIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { error } = await supabase.rpc('reorder_campaign_template_task', { p_template_id: templateId, p_ordered_ids: orderedIds })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath('/templates')
  return { error: null }
}

// ---- spawn (used by the hub "Apply template" and the create-campaign flow) ----
export async function spawnFromTemplateAction(campaignId: string, templateId: string): Promise<{ error: string | null; count: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', count: 0 }
  const { data, error } = await supabase.rpc('spawn_campaign_tasks', { p_campaign_id: campaignId, p_template_id: templateId })
  if (error) return { error: rpcErrorMessage(error), count: 0 }
  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, count: (data as number) ?? 0 }
}

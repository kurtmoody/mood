'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TimeResult = { error: string | null }

async function rpc(fn: string, args: Record<string, unknown>): Promise<TimeResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { error } = await supabase.rpc(fn, args)
  return { error: error?.message ?? null }
}

export async function startTimerAction(clientId: string, taskId: string | null, note: string | null): Promise<TimeResult> {
  return rpc('start_timer', { p_client_id: clientId, p_task_id: taskId, p_note: note })
}

export async function stopTimerAction(entryId: string, endedAtISO: string | null): Promise<TimeResult> {
  return rpc('stop_timer', { p_entry_id: entryId, p_ended_at: endedAtISO })
}

export async function logTimeAction(
  clientId: string, taskId: string | null, startISO: string, endISO: string, note: string | null,
): Promise<TimeResult> {
  return rpc('log_time', { p_client_id: clientId, p_task_id: taskId, p_started_at: startISO, p_ended_at: endISO, p_note: note })
}

export async function updateTimeEntryAction(
  entryId: string, taskId: string | null, startISO: string, endISO: string | null, note: string | null,
): Promise<TimeResult> {
  return rpc('update_time_entry', { p_entry_id: entryId, p_task_id: taskId, p_started_at: startISO, p_ended_at: endISO, p_note: note })
}

export async function deleteTimeEntryAction(entryId: string): Promise<TimeResult> {
  return rpc('delete_time_entry', { p_entry_id: entryId })
}

export async function setClientTimesheetEnabledAction(clientId: string, enabled: boolean): Promise<TimeResult> {
  const r = await rpc('set_client_timesheet_enabled', { p_client_id: clientId, p_enabled: enabled })
  if (!r.error) revalidatePath(`/clients/${clientId}`)
  return r
}

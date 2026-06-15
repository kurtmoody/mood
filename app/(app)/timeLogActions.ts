'use server'

import { createClient } from '@/lib/supabase/server'
import { rpcErrorMessage } from '@/lib/rpcError'
import { revalidatePath } from 'next/cache'

export type LogTimeResult = { error: string | null }

// Global "Log time" — a completed manual entry against any timesheet-enabled client.
// taskId links the entry to a task; null logs unattributed time (note carries the text).
// Authorisation + tz-correctness are the RPC's job; started/ended come in as UTC ISO.
export async function logTimeAction(
  clientId: string,
  taskId: string | null,
  startISO: string,
  endISO: string,
  note: string | null,
): Promise<LogTimeResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('log_time', {
    p_client_id: clientId,
    p_task_id: taskId,
    p_started_at: startISO,
    p_ended_at: endISO,
    p_note: note,
  })
  if (error) return { error: rpcErrorMessage(error) }

  // Refresh that client's detail page so its timesheet list shows the new entry if open.
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

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

// Create-task-on-the-fly: make a minimal task for the client, then log time against it.
// Owner is the caller's own team_member (resolved server-side, never client-passed); if the
// caller has no team_member row, the task is created ownerless. Owner=self deliberately fires
// the assignment notification to the client's accountable person — accepted by design.
export async function createTaskAndLogTimeAction(
  clientId: string,
  title: string,
  startISO: string,
  endISO: string,
): Promise<LogTimeResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!title.trim()) return { error: 'Task title is required.' }

  // Resolve owner = self. RLS scopes team_member reads to the caller's agency, so this only
  // ever returns the caller's own row; no row → ownerless (null).
  const { data: tm } = await supabase.from('team_member').select('id').eq('user_id', user.id).limit(1).maybeSingle()
  const ownerId = (tm?.id as string | undefined) ?? null

  // 1) Create the task (minimal — status/priority/type default). Returns the new id.
  const { data: newTaskId, error: createErr } = await supabase.rpc('create_task', {
    p_client_id: clientId,
    p_title: title.trim(),
    p_owner_id: ownerId,
  })
  if (createErr) return { error: rpcErrorMessage(createErr) }

  // 2) Log time against it. The task title is the label, so no note. If this fails the task
  // simply exists un-logged — acceptable; the user retries.
  const { error: logErr } = await supabase.rpc('log_time', {
    p_client_id: clientId,
    p_task_id: newTaskId,
    p_started_at: startISO,
    p_ended_at: endISO,
    p_note: null,
  })
  if (logErr) return { error: rpcErrorMessage(logErr) }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  return { error: null }
}

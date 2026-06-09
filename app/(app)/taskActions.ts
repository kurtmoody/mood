'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type TaskResult = { error: string | null }

export type TaskInput = {
  client_id: string | null
  task_type: string | null
  title: string
  owner_id: string | null
  status: string
  priority: string
  due_date: string | null
  next_action: string | null
  notes: string | null
}

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

function rpcParams(t: TaskInput) {
  return {
    p_client_id: t.client_id,
    p_task_type: t.task_type,
    p_title: t.title,
    p_owner_id: t.owner_id,
    p_status: t.status,
    p_priority: t.priority,
    p_due_date: t.due_date,
    p_next_action: t.next_action,
    p_notes: t.notes,
  }
}

function done(): TaskResult {
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function createTaskAction(input: TaskInput): Promise<TaskResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('create_task', rpcParams(input))
  if (error) return { error: error.message }
  return done()
}

export async function updateTaskAction(taskId: string, input: TaskInput): Promise<TaskResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('update_task', { p_task_id: taskId, ...rpcParams(input) })
  if (error) return { error: error.message }
  return done()
}

export async function deleteTaskAction(taskId: string): Promise<TaskResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('delete_task', { p_task_id: taskId })
  if (error) return { error: error.message }
  return done()
}

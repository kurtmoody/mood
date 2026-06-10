import type { TaskInput } from '../taskActions'

export type ServesPost = { title: string; href: string | null }

export type Task = {
  id: string
  client_id: string | null
  content_item_id: string | null
  task_type: string | null
  title: string
  owner_id: string | null
  status: string
  priority: string
  due_date: string | null
  next_action: string | null
  notes: string | null
  estimated_hours: number | null
  start_date: string | null
  clientName: string | null
  clientColour: string | null
  ownerName: string | null
  servesPost: ServesPost | null
  archived: boolean
}

export type Member = { id: string; full_name: string; user_id: string | null }
export type ClientOpt = { id: string; name: string; colour: string }

export function taskToInput(t: Task): TaskInput {
  return {
    client_id: t.client_id, task_type: t.task_type, title: t.title, owner_id: t.owner_id,
    status: t.status, priority: t.priority, due_date: t.due_date, next_action: t.next_action,
    notes: t.notes, content_item_id: t.content_item_id,
    estimated_hours: t.estimated_hours, start_date: t.start_date,
  }
}

export function fmtTaskDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}

export const taskToday = () => new Date().toISOString().slice(0, 10)

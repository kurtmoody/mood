import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { clientColour } from '@/lib/colour'
import TasksBoard from './TasksBoard'

export default async function TasksPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // internal-only

  // RLS scopes task to is_agency_member(agency_id); client/owner embeds are single-FK
  // (unambiguous). Don't swallow the error.
  const { data: tasks, error } = await supabase
    .from('task')
    .select('id, client_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, client:client_id ( name, calendar_colour ), owner:owner_id ( full_name )')
    .order('created_at', { ascending: false })
  if (error) console.error('tasks query failed:', error.message, error.code)

  const { data: team } = await supabase.from('team_member').select('id, full_name, user_id').eq('is_active', true).order('full_name')
  const { data: clients } = await supabase.from('client').select('id, name, calendar_colour').order('name')

  const rows = (tasks ?? []).map((t: any) => ({
    id: t.id,
    client_id: t.client_id,
    task_type: t.task_type,
    title: t.title,
    owner_id: t.owner_id,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    next_action: t.next_action,
    notes: t.notes,
    clientName: t.client?.name ?? null,
    clientColour: t.client ? clientColour({ id: t.client_id, calendar_colour: t.client.calendar_colour }) : null,
    ownerName: t.owner?.full_name ?? null,
  }))

  return (
    <TasksBoard
      tasks={rows}
      teamMembers={(team ?? []).map((m: any) => ({ id: m.id, full_name: m.full_name, user_id: m.user_id }))}
      clients={(clients ?? []).map((c: any) => ({ id: c.id, name: c.name, colour: clientColour(c) }))}
      currentUserId={access.userId}
      loadError={!!error}
    />
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { clientColour } from '@/lib/colour'
import { mondayOf, maltaDate } from '@/lib/week'
import TasksBoard from './TasksBoard'
import PageContainer from '@/components/PageContainer'

function postHref(p: { id: string; client_id: string | null; scheduled_at: string | null }) {
  if (!p.client_id) return null
  return p.scheduled_at
    ? `/?client=${p.client_id}&week=${mondayOf(maltaDate(p.scheduled_at))}&view=week&post=${p.id}`
    : `/?client=${p.client_id}&post=${p.id}`
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ forPost?: string; view?: string; owner?: string; status?: string; client?: string }> }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // internal-only

  // ?forPost=<content_item_id> → open the create modal pre-filled for that post.
  // ?view / ?owner / ?status seed the view + filters (shareable, dashboard deep-links).
  const { forPost, view, owner, status, client } = await searchParams

  // All independent — one parallel round. RLS scopes task to the agency; single-FK
  // embeds (client/owner/content) are unambiguous.
  const [{ data: tasks, error }, { data: team }, { data: clients }, { data: ownership }, { data: viewPref }, { data: prefillPost }] = await Promise.all([
    supabase
      .from('task')
      .select('id, client_id, content_item_id, task_type, title, owner_id, status, priority, due_date, next_action, notes, estimated_hours, start_date, value, value_client_visible, invoice_status, client:client_id ( name, calendar_colour, status ), owner:owner_id ( full_name ), content:content_item_id ( id, title, client_id, scheduled_at )')
      .order('created_at', { ascending: false }),
    supabase.from('team_member').select('id, full_name, user_id').eq('is_active', true).order('full_name'),
    supabase.from('client').select('id, name, calendar_colour').order('name'),
    supabase.from('client_ownership').select('client_id, lead_pm_id'),
    // This user's column preference for the task list (own-row read under RLS).
    supabase.from('user_view_preference').select('config').eq('view_key', 'tasks').maybeSingle(),
    forPost
      ? supabase.from('content_item').select('id, title, client_id').eq('id', forPost).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (error) console.error('tasks query failed:', error.message, error.code)

  const leadPmByClient: Record<string, string | null> = {}
  for (const o of ownership ?? []) leadPmByClient[(o as any).client_id] = (o as any).lead_pm_id

  const rows = (tasks ?? []).map((t: any) => ({
    id: t.id,
    client_id: t.client_id,
    content_item_id: t.content_item_id,
    task_type: t.task_type,
    title: t.title,
    owner_id: t.owner_id,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    next_action: t.next_action,
    notes: t.notes,
    estimated_hours: t.estimated_hours,
    start_date: t.start_date,
    value: t.value,
    value_client_visible: t.value_client_visible ?? false,
    invoice_status: t.invoice_status ?? 'not_invoiced',
    clientName: t.client?.name ?? null,
    clientColour: t.client ? clientColour({ id: t.client_id, calendar_colour: t.client.calendar_colour }) : null,
    ownerName: t.owner?.full_name ?? null,
    servesPost: t.content ? { title: t.content.title ?? 'Untitled', href: postHref(t.content) } : null,
    // Internal tasks (no client) are never archived — they have no client to archive.
    archived: t.client?.status === 'archived',
  }))

  const prefill = prefillPost
    ? { contentItemId: prefillPost.id, clientId: prefillPost.client_id, postTitle: prefillPost.title ?? 'Untitled' }
    : null
  const initialView = view === 'kanban' || view === 'calendar' ? view : 'list'

  return (
    <PageContainer>
      <TasksBoard
        tasks={rows}
        teamMembers={(team ?? []).map((m: any) => ({ id: m.id, full_name: m.full_name, user_id: m.user_id }))}
        clients={(clients ?? []).map((c: any) => ({ id: c.id, name: c.name, colour: clientColour(c) }))}
        leadPmByClient={leadPmByClient}
        currentUserId={access.userId}
        loadError={!!error}
        prefill={prefill}
        initialView={initialView}
        initialOwner={owner ?? ''}
        initialStatus={status ?? ''}
        initialClient={client ?? ''}
        savedColumns={(viewPref?.config as { key: string; hidden: boolean }[] | null) ?? null}
      />
    </PageContainer>
  )
}

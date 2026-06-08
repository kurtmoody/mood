import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CalendarBoard from './CalendarBoard'
import {
  addDays,
  isDateStr,
  isMonthStr,
  mondayOf,
  monthGridDates,
  monthOf,
  todayMalta,
  zonedDayStartUTC,
} from '@/lib/week'

type Channel = { id: string; type: string; label: string | null }

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; week?: string; month?: string; view?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Clients the user can see (RLS scopes to their agency's clients).
  const { data: clients } = await supabase
    .from('client')
    .select('id, name')
    .order('name')
  const clientList = clients ?? []

  if (clientList.length === 0) {
    return (
      <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
        <div className="text-sm font-semibold mb-1">No clients yet</div>
        <div className="text-sm text-[#5A5E66]">Add a client to start planning content.</div>
      </div>
    )
  }

  const { client: requested, week: weekParam, month: monthParam, view: viewParam } = await searchParams

  // Selected client from ?client=, falling back to the first one.
  const selected = clientList.find((c) => c.id === requested) ?? clientList[0]

  const view: 'week' | 'month' = viewParam === 'month' ? 'month' : 'week'
  const todayStr = todayMalta()

  // Both anchors are tracked independently so each view keeps its own position.
  const monday = mondayOf(isDateStr(weekParam) ? weekParam : todayStr)
  const month = isMonthStr(monthParam) ? monthParam : monthOf(todayStr)

  // Fetch the active view's full visible range (Malta-day boundaries → UTC).
  const grid = view === 'week' ? null : monthGridDates(month)
  const rangeStartDate = view === 'week' ? monday : grid![0]
  const rangeEndDate = view === 'week' ? addDays(monday, 7) : addDays(grid![grid!.length - 1], 1)
  const weekStartUTC = zonedDayStartUTC(rangeStartDate).toISOString()
  const weekEndUTC = zonedDayStartUTC(rangeEndDate).toISOString()

  // All channels for the user's clients, grouped — powers the New post form's channel picker.
  const { data: allChannels } = await supabase
    .from('channel')
    .select('id, type, label, client_id')
  const channelsByClient: Record<string, Channel[]> = {}
  for (const ch of allChannels ?? []) {
    ;(channelsByClient[ch.client_id] ??= []).push({ id: ch.id, type: ch.type, label: ch.label })
  }

  const { data: items } = await supabase
    .from('content_item')
    .select('id, title, content_type, scheduled_at, status, current_version_id, channel:channel_id ( type, label ), versions:content_version ( id, body, version_no ), events:approval_event ( id, action, note, created_at, actor_id ), comments:comment ( id, body, created_at, author_id )')
    .eq('client_id', selected.id)
    .gte('scheduled_at', weekStartUTC)
    .lt('scheduled_at', weekEndUTC)
    .order('scheduled_at')

  // Resolve approval-event actors to team-member names.
  const { data: team } = await supabase.from('team_member').select('full_name, user_id')
  const nameByUser = new Map<string, string>()
  for (const t of team ?? []) if (t.user_id) nameByUser.set(t.user_id, t.full_name)

  const posts = (items ?? []).map((it: any) => {
    // Body is versioned — resolve the current version (or the latest).
    const versions = it.versions ?? []
    const current =
      versions.find((v: any) => v.id === it.current_version_id) ??
      [...versions].sort((a: any, b: any) => b.version_no - a.version_no)[0]
    // History oldest → newest, actor mapped to a name (or null).
    const events = (it.events ?? [])
      .map((e: any) => ({
        id: e.id,
        action: e.action,
        note: e.note,
        created_at: e.created_at,
        actor: (e.actor_id && nameByUser.get(e.actor_id)) || null,
      }))
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    const comments = (it.comments ?? [])
      .map((c: any) => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        author_id: c.author_id,
        author: (c.author_id && nameByUser.get(c.author_id)) || 'Client',
      }))
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    return { ...it, body: current?.body ?? null, events, comments }
  })

  // Current user + whether they're agency staff (for comment-delete visibility).
  const { data: agencyMem } = await supabase
    .from('membership')
    .select('scope_id')
    .eq('scope_type', 'agency')
    .limit(1)
  const isAgency = !!agencyMem?.length

  return (
    <CalendarBoard
      clients={clientList}
      selectedClientId={selected.id}
      channelsByClient={channelsByClient}
      posts={posts}
      view={view}
      monday={monday}
      month={month}
      todayStr={todayStr}
      currentUserId={user.id}
      isAgency={isAgency}
    />
  )
}

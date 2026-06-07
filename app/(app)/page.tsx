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
    .select('id, title, content_type, scheduled_at, status, current_version_id, channel:channel_id ( type, label ), versions:content_version ( id, body, version_no )')
    .eq('client_id', selected.id)
    .gte('scheduled_at', weekStartUTC)
    .lt('scheduled_at', weekEndUTC)
    .order('scheduled_at')

  // Body is versioned — resolve each item's current version (or the latest) server-side.
  const posts = (items ?? []).map((it: any) => {
    const versions = it.versions ?? []
    const current =
      versions.find((v: any) => v.id === it.current_version_id) ??
      [...versions].sort((a: any, b: any) => b.version_no - a.version_no)[0]
    return { ...it, body: current?.body ?? null }
  })

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
    />
  )
}

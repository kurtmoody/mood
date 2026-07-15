import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { clientColour, fallbackColour } from '@/lib/colour'
import CalendarBoard from './CalendarBoard'
import PageContainer from '@/components/PageContainer'
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

// Statuses a client user is allowed to see (mirrors the RLS read floor, 0015).
const CLIENT_VISIBLE_STATUSES = ['client_review', 'changes_requested', 'approved', 'scheduled', 'posted']

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; clients?: string; week?: string; month?: string; view?: string; post?: string }>
}) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  const isAgency = access.type === 'agency'
  const isClient = access.type === 'client'

  // Clients the user can see (RLS scopes this already); for client users restrict
  // explicitly to their own client(s) — defence-in-depth, no agency-wide picker.
  let clientsQuery = supabase.from('client').select('id, name, calendar_colour, status').order('name')
  if (isClient) clientsQuery = clientsQuery.in('id', access.clientIds)
  const [{ data: clients }, params] = await Promise.all([clientsQuery, searchParams])
  const clientList = clients ?? []

  if (clientList.length === 0) {
    return (
      <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
        <div className="text-sm font-semibold mb-1">No clients yet</div>
        <div className="text-sm text-[#5A5E66]">Add a client to start planning content.</div>
      </div>
    )
  }

  const { client: requested, clients: clientsParam, week: weekParam, month: monthParam, view: viewParam, post: postParam } = params

  // Combined view by default = ALL the user's visible clients. ?clients= (comma list)
  // picks a subset; ?client= (single, used by deep-links) focuses one. Clients only
  // ever see their own — visibleIds is already RLS-scoped above.
  const visibleIds = clientList.map((c) => c.id)
  const requestedSubset = clientsParam ? clientsParam.split(',').filter((id) => visibleIds.includes(id)) : []
  const selectedClientIds =
    requestedSubset.length > 0 ? requestedSubset
    : requested && visibleIds.includes(requested) ? [requested]
    : visibleIds

  // 'table' (agency content tracker, formerly 'grid' — old links still work) is
  // month-scoped — same query/source as the calendar. A client can't reach it.
  const view: 'week' | 'month' | 'table' =
    viewParam === 'month' ? 'month' : (viewParam === 'table' || viewParam === 'grid') && isAgency ? 'table' : 'week'
  const todayStr = todayMalta()

  // Both anchors are tracked independently so each view keeps its own position.
  const monday = mondayOf(isDateStr(weekParam) ? weekParam : todayStr)
  const month = isMonthStr(monthParam) ? monthParam : monthOf(todayStr)

  // Fetch the active view's full visible range (Malta-day boundaries → UTC). Grid uses the
  // month window like the month view.
  const monthRange = view !== 'week'
  const gridDates = monthRange ? monthGridDates(month) : null
  const rangeStartDate = monthRange ? gridDates![0] : monday
  const rangeEndDate = monthRange ? addDays(gridDates![gridDates!.length - 1], 1) : addDays(monday, 7)
  const weekStartUTC = zonedDayStartUTC(rangeStartDate).toISOString()
  const weekEndUTC = zonedDayStartUTC(rangeEndDate).toISOString()

  // RLS already restricts client users to client_review+ posts; the explicit
  // status filter is defence-in-depth and helps the query planner.
  let itemsQuery = supabase
    .from('content_item')
    .select('id, client_id, title, content_type, scheduled_at, status, current_version_id, post_group_id, channel_id, designer_id, design_status, drive_url, high_res_url, boost, ad_budget, date_posted, posted_url, campaign_id, channel:channel_id ( type, label ), channels:content_item_channel ( channel:channel_id ( id, type, label ) ), versions:content_version!content_version_content_item_id_fkey ( id, body, visual_content, version_no, created_by, created_at, media ( id, storage_path, mime_type, created_at, sort_order ) ), events:approval_event ( id, version_id, action, note, created_at, actor_id ), comments:comment ( id, body, created_at, author_id ), asset_links:post_asset_link ( id, label, url, sort_order ), tasks:task ( id, title, status, owner:owner_id ( full_name ) )')
    .in('client_id', selectedClientIds)
    .gte('scheduled_at', weekStartUTC)
    .lt('scheduled_at', weekEndUTC)
  if (isClient) itemsQuery = itemsQuery.in('status', CLIENT_VISIBLE_STATUSES)

  // Channels (New post form picker), the visible range's posts, the team directory
  // (approval-event actor names) and the user's table column prefs are independent —
  // one parallel round.
  const [{ data: allChannels }, { data: items, error }, { data: team }, { data: viewPref }] = await Promise.all([
    supabase.from('channel').select('id, type, label, client_id'),
    itemsQuery.order('scheduled_at'),
    supabase.from('team_member').select('full_name, user_id'),
    supabase.from('user_view_preference').select('config').eq('view_key', 'content_table').maybeSingle(),
  ])
  if (error) console.error('content_item query failed:', error.message, error.code)

  const channelsByClient: Record<string, Channel[]> = {}
  for (const ch of allChannels ?? []) {
    ;(channelsByClient[ch.client_id] ??= []).push({ id: ch.id, type: ch.type, label: ch.label })
  }
  const nameByUser = new Map<string, string>()
  for (const t of team ?? []) if (t.user_id) nameByUser.set(t.user_id, t.full_name)

  const clientById = new Map(clientList.map((c) => [c.id, c]))

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
    // Approval events grouped by version (for per-version status in the history viewer).
    const eventsByVersion = new Map<string, any[]>()
    for (const e of it.events ?? []) {
      if (!e.version_id) continue
      const arr = eventsByVersion.get(e.version_id)
      if (arr) arr.push(e)
      else eventsByVersion.set(e.version_id, [e])
    }
    // Full version history, newest first. Media url is filled by the batched signing below.
    const versionList = [...versions]
      .sort((a: any, b: any) => b.version_no - a.version_no)
      .map((v: any) => ({
        id: v.id,
        version_no: v.version_no,
        body: v.body ?? null,
        visual_content: v.visual_content ?? null,
        created_at: v.created_at,
        author: (v.created_by && nameByUser.get(v.created_by)) || null,
        isCurrent: v.id === current?.id,
        media: (v.media ?? [])
          .slice()
          .sort((a: any, b: any) => (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
          .map((m: any) => ({ id: m.id, storage_path: m.storage_path, mime_type: m.mime_type, created_at: m.created_at, url: null as string | null })),
        events: (eventsByVersion.get(v.id) ?? [])
          .map((e: any) => ({ action: e.action, created_at: e.created_at }))
          .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)),
      }))
    // The current version's media (same objects as in versionList, so signing fills both).
    const media = versionList.find((v: any) => v.isCurrent)?.media ?? []
    const cli = clientById.get(it.client_id)
    return {
      ...it,
      body: current?.body ?? null,
      visual_content: current?.visual_content ?? null,
      version_no: current?.version_no ?? 1,
      // The full channel set (0054); the single channel_id stays the primary for the cards.
      channels: (it.channels ?? []).map((r: any) => (Array.isArray(r.channel) ? r.channel[0] : r.channel)).filter(Boolean),
      events, comments, media, versions: versionList,
      clientName: cli?.name ?? '',
      clientColour: cli ? clientColour(cli) : fallbackColour(it.client_id),
      // Archiving is an internal agency concept — never hide/mark posts for client users.
      archived: isAgency && cli?.status === 'archived',
      asset_links: (it.asset_links ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order),
      tasks: (it.tasks ?? []).map((t: any) => ({ id: t.id, title: t.title, status: t.status, ownerName: t.owner?.full_name ?? null })),
    }
  })

  // Sign ALL versions' media in ONE batched call (1-hour TTL) — not just the current
  // version, so the version-history viewer's old thumbnails load. RLS-gated server-side.
  const allPaths: string[] = posts.flatMap((p: any) => p.versions.flatMap((v: any) => v.media.map((m: any) => m.storage_path)))
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage.from('content-media').createSignedUrls(allPaths, 3600)
    const urlByPath = new Map<string, string>()
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
    for (const p of posts) for (const v of p.versions) for (const m of v.media) m.url = urlByPath.get(m.storage_path) ?? null
  }

  return (
    <PageContainer>
      <CalendarBoard
        clients={clientList.map((c) => ({ id: c.id, name: c.name, colour: clientColour(c), archived: isAgency && c.status === 'archived' }))}
        selectedClientIds={selectedClientIds}
        defaultClientId={selectedClientIds[0] ?? visibleIds[0]}
        channelsByClient={channelsByClient}
        posts={posts}
        view={view}
        monday={monday}
        month={month}
        todayStr={todayStr}
        currentUserId={access.userId}
        isAgency={isAgency}
        openPostId={postParam ?? null}
        loadError={!!error}
        savedColumns={(viewPref?.config as { key: string; hidden: boolean }[] | null) ?? null}
      />
    </PageContainer>
  )
}

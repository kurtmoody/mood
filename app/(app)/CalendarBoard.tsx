'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Calendar, { STATUS, type Item } from '@/components/Calendar'
import MonthCalendar from '@/components/MonthCalendar'
import FilterMenu from '@/components/FilterMenu'
import Drawer from '@/components/Drawer'
import NewPostForm from './NewPostForm'
import { transitionPostAction } from './approvalActions'
import { addCommentAction, deleteCommentAction } from './commentActions'
import { updatePostAction, reschedulePostAction } from './postActions'
import { addDays, addMonths, maltaDate, mondayOf, monthOf, monthGridDates, monthLabel, rescheduleToDateMalta, weekDates, weekRangeLabel } from '@/lib/week'

type ClientOption = { id: string; name: string; colour: string; archived: boolean }
type Channel = { id: string; type: string; label: string | null }

export default function CalendarBoard({
  clients,
  selectedClientIds,
  defaultClientId,
  channelsByClient,
  posts,
  view,
  monday,
  month,
  todayStr,
  currentUserId,
  isAgency,
  openPostId,
  loadError,
}: {
  clients: ClientOption[]
  selectedClientIds: string[]
  defaultClientId: string
  channelsByClient: Record<string, Channel[]>
  posts: Item[]
  view: 'week' | 'month'
  monday: string
  month: string
  todayStr: string
  currentUserId: string
  isAgency: boolean
  openPostId: string | null
  loadError: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Item | null>(null)
  const [formDate, setFormDate] = useState<string | null>(null)

  // Local copy for optimistic drag-reschedule; re-syncs whenever server data changes.
  const [localPosts, setLocalPosts] = useState(posts)
  const syncKey = posts.map((p) => `${p.id}:${p.scheduled_at}:${p.status}`).join('|')
  useEffect(() => { setLocalPosts(posts) }, [syncKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const [actionError, setActionError] = useState<string | null>(null)
  // Past-date drop awaiting confirmation (offers "mark posted" only for eligible posts).
  const [confirmDrop, setConfirmDrop] = useState<{ item: Item; targetDate: string; eligible: boolean } | null>(null)

  async function doReschedule(item: Item, targetDate: string, markPosted: boolean) {
    if (!item.scheduled_at) return
    const newISO = rescheduleToDateMalta(item.scheduled_at, targetDate).toISOString()
    setActionError(null)
    setLocalPosts((prev) => prev.map((p) =>
      p.id === item.id ? { ...p, scheduled_at: newISO, status: markPosted ? 'posted' : p.status } : p,
    ))
    const r = await reschedulePostAction(item.id, newISO, markPosted)
    if (r.error) { setActionError(r.error); router.refresh() } // revert to server truth
  }

  // Agency drag-drop onto a day. Same Malta day → no-op. Past day → confirm first.
  function onReschedule(item: Item, targetDate: string) {
    if (!item.scheduled_at || maltaDate(item.scheduled_at) === targetDate) return
    if (targetDate < todayStr) {
      setConfirmDrop({ item, targetDate, eligible: item.status === 'approved' || item.status === 'scheduled' })
    } else {
      doReschedule(item, targetDate, false)
    }
  }

  // Client-side filters over the already-loaded (RLS-scoped) posts — no refetch, no
  // query/URL change. State resets on navigation/refresh (not persisted), which is fine.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set())
  const [needsReview, setNeedsReview] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const hasArchived = clients.some((c) => c.archived)
  // Clients shown in the picker/legend track the toggle, so the picker matches the grid.
  const visibleClients = showArchived ? clients : clients.filter((c) => !c.archived)

  // Keep the open drawer in sync after a transition refreshes the posts.
  useEffect(() => {
    setSelected((cur) => (cur ? posts.find((p) => p.id === cur.id) ?? null : cur))
  }, [posts])

  // Deep-link from a notification (?post=): open that post's drawer if it's in the
  // RLS-filtered posts, then strip ?post (keeping client/week) so it doesn't linger.
  useEffect(() => {
    if (!openPostId) return
    const target = posts.find((p) => p.id === openPostId)
    if (target) setSelected(target)
    const sp = new URLSearchParams(params.toString())
    sp.delete('post')
    router.replace(`/?${sp.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPostId])

  // Status options are role-gated: clients only ever see client-visible statuses, so
  // "draft"/"internal_review" are never even offered to them.
  const statusOptions = (
    isAgency
      ? ['draft', 'internal_review', 'changes_requested', 'client_review', 'approved', 'scheduled', 'posted']
      : ['client_review', 'changes_requested', 'approved', 'scheduled', 'posted']
  ).map((s) => ({ value: s, label: STATUS[s]?.label ?? s }))

  // Channel options come from the channels actually present in the loaded posts.
  const channelOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of posts) {
      const key = p.channel_id ?? '__none__'
      if (!map.has(key)) {
        const t = p.channel?.type
        map.set(key, p.channel?.label ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'No channel'))
      }
    }
    return [...map].map(([value, label]) => ({ value, label }))
  }, [posts])

  // The visible set: "Needs my review" (role-aware) takes precedence over the status
  // picker; channel filter ANDs in. Empty selections mean "all".
  const filtered = useMemo(() => {
    const review = isAgency ? ['internal_review', 'changes_requested'] : ['client_review']
    return localPosts.filter((p) => {
      if (p.archived && !showArchived) return false
      if (needsReview) {
        if (!review.includes(p.status)) return false
      } else if (statusFilter.size > 0 && !statusFilter.has(p.status)) {
        return false
      }
      if (channelFilter.size > 0 && !channelFilter.has(p.channel_id ?? '__none__')) return false
      return true
    })
  }, [localPosts, needsReview, statusFilter, channelFilter, isAgency, showArchived])

  const anyFilter = needsReview || statusFilter.size > 0 || channelFilter.size > 0
  const toggleIn = (set: Set<string>, v: string) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }
  function clearFilters() {
    setNeedsReview(false)
    setStatusFilter(new Set())
    setChannelFilter(new Set())
  }

  // Client selection lives in the URL (?clients=) so it persists and scopes the query.
  // Toggling navigates; selecting all (or none) clears the param back to the default.
  function setClients(ids: string[]) {
    const sp = new URLSearchParams(params.toString())
    if (ids.length === 0 || ids.length === clients.length) sp.delete('clients')
    else sp.set('clients', ids.join(','))
    sp.delete('client') // drop any single-client deep-link param
    router.push(`/?${sp.toString()}`)
  }
  function toggleClient(id: string) {
    const set = new Set(selectedClientIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setClients([...set])
  }

  function go(overrides: Record<string, string>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(overrides)) sp.set(k, v)
    router.push(`/?${sp.toString()}`)
  }

  function prev() {
    if (view === 'week') go({ view: 'week', week: addDays(monday, -7) })
    else go({ view: 'month', month: addMonths(month, -1) })
  }
  function next() {
    if (view === 'week') go({ view: 'week', week: addDays(monday, 7) })
    else go({ view: 'month', month: addMonths(month, 1) })
  }
  function today() {
    if (view === 'week') go({ view: 'week', week: mondayOf(todayStr) })
    else go({ view: 'month', month: monthOf(todayStr) })
  }

  const tab = (v: 'week' | 'month', label: string) => (
    <button
      onClick={() => (v === 'week' ? go({ view: 'week', week: monday }) : go({ view: 'month', month }))}
      className={`px-3 py-2 ${view === v ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold">
            {selectedClientIds.length === 1
              ? clients.find((c) => c.id === selectedClientIds[0])?.name ?? 'Calendar'
              : 'All clients'}
          </div>
          <div className="text-sm text-[#5A5E66] mt-1.5">
            {view === 'week' ? weekRangeLabel(monday) : monthLabel(month)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-sm">
            {tab('week', 'Week')}
            {tab('month', 'Month')}
          </div>
          <div className="flex items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-sm text-[#5A5E66]">
            <button onClick={prev} aria-label="Previous" className="px-2.5 py-2 hover:bg-[#F4F4F6]">‹</button>
            <button onClick={today} className="px-3 py-2 border-x border-[#E2E2E5] hover:bg-[#F4F4F6]">Today</button>
            <button onClick={next} aria-label="Next" className="px-2.5 py-2 hover:bg-[#F4F4F6]">›</button>
          </div>
          {isAgency && (
            <button
              onClick={() => setFormDate('')}
              className="shrink-0 bg-[#15171C] text-white rounded-lg px-3.5 py-2 text-sm font-semibold"
            >
              New post
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {visibleClients.length > 1 && (
          <FilterMenu
            label="Clients"
            options={visibleClients.map((c) => ({ value: c.id, label: c.name }))}
            selected={new Set(selectedClientIds)}
            onToggle={toggleClient}
            onClear={() => setClients([])}
          />
        )}
        <FilterMenu
          label="Status"
          options={statusOptions}
          selected={statusFilter}
          onToggle={(v) => { setNeedsReview(false); setStatusFilter((s) => toggleIn(s, v)) }}
          onClear={() => setStatusFilter(new Set())}
        />
        {channelOptions.length > 1 && (
          <FilterMenu
            label="Channel"
            options={channelOptions}
            selected={channelFilter}
            onToggle={(v) => setChannelFilter((s) => toggleIn(s, v))}
            onClear={() => setChannelFilter(new Set())}
          />
        )}
        <button
          onClick={() => { setNeedsReview((v) => !v); setStatusFilter(new Set()) }}
          className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${
            needsReview ? 'bg-[#15171C] text-white border-[#15171C] font-medium' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'
          }`}
        >
          Needs my review
        </button>
        {hasArchived && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${
              showArchived ? 'bg-[#15171C] text-white border-[#15171C] font-medium' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'
            }`}
          >
            Show archived
          </button>
        )}
        {anyFilter && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-[#9398A1]">Showing {filtered.length} of {localPosts.length}</span>
            <button onClick={clearFilters} className="text-xs text-[#5A5E66] hover:underline cursor-pointer">Clear filters</button>
          </div>
        )}
      </div>

      {selectedClientIds.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#5A5E66]">
          {visibleClients.filter((c) => selectedClientIds.includes(c.id)).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: c.colour }} />
              {c.name}{c.archived && <span className="text-[#9398A1]"> · archived</span>}
            </span>
          ))}
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">
          ⚠️ Couldn&rsquo;t load posts. Please refresh.
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">{actionError}</div>
      )}

      {view === 'week' ? (
        <Calendar
          items={filtered}
          weekDates={weekDates(monday)}
          todayStr={todayStr}
          onSelect={setSelected}
          onNewPost={(d) => setFormDate(d)}
          isAgency={isAgency}
          onReschedule={isAgency ? onReschedule : undefined}
        />
      ) : (
        <MonthCalendar
          items={filtered}
          gridDates={monthGridDates(month)}
          month={month}
          todayStr={todayStr}
          onSelect={setSelected}
          onNewPost={(d) => setFormDate(d)}
          onShowWeek={(m) => go({ view: 'week', week: m })}
          isAgency={isAgency}
          onReschedule={isAgency ? onReschedule : undefined}
        />
      )}

      <Drawer
        item={selected}
        onClose={() => setSelected(null)}
        transitionAction={transitionPostAction}
        updatePostAction={updatePostAction}
        addCommentAction={addCommentAction}
        deleteCommentAction={deleteCommentAction}
        channels={selected?.client_id ? channelsByClient[selected.client_id] ?? [] : []}
        clientId={selected?.client_id ?? defaultClientId}
        currentUserId={currentUserId}
        isAgency={isAgency}
      />

      {formDate !== null && (
        <NewPostForm
          clients={clients}
          channelsByClient={channelsByClient}
          defaultClientId={defaultClientId}
          defaultDate={formDate}
          onClose={() => setFormDate(null)}
        />
      )}

      {confirmDrop && (
        <RescheduleConfirm
          targetDate={confirmDrop.targetDate}
          eligible={confirmDrop.eligible}
          onCancel={() => setConfirmDrop(null)}
          onConfirm={(markPosted) => {
            const { item, targetDate, eligible } = confirmDrop
            setConfirmDrop(null)
            doReschedule(item, targetDate, eligible && markPosted)
          }}
        />
      )}
    </>
  )
}

// Past-date drop confirmation. Always confirms the move; offers "mark as posted" only
// when the post is eligible (approved/scheduled). Cancel → the post snaps back (nothing
// was optimistically moved yet).
function RescheduleConfirm({
  targetDate,
  eligible,
  onConfirm,
  onCancel,
}: {
  targetDate: string
  eligible: boolean
  onConfirm: (markPosted: boolean) => void
  onCancel: () => void
}) {
  const [markPosted, setMarkPosted] = useState(false)
  const nice = new Date(`${targetDate}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white border border-[#ECECEE] rounded-2xl shadow-xl p-5">
        <div className="text-sm font-semibold mb-1">Move to a past date?</div>
        <p className="text-sm text-[#5A5E66] mb-4">You&rsquo;re moving this post to <span className="font-medium text-[#15171C]">{nice}</span>, which is in the past.</p>
        {eligible && (
          <label className="flex items-center gap-2 text-sm text-[#5A5E66] mb-4 cursor-pointer">
            <input type="checkbox" checked={markPosted} onChange={(e) => setMarkPosted(e.target.checked)} className="cursor-pointer" />
            Mark this post as posted
          </label>
        )}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-[#5A5E66] rounded-lg px-3 py-2 hover:bg-[#F4F4F6] cursor-pointer">Cancel</button>
          <button onClick={() => onConfirm(markPosted)} className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer">Move</button>
        </div>
      </div>
    </div>
  )
}

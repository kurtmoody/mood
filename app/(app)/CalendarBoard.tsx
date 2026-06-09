'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Calendar, { STATUS, type Item } from '@/components/Calendar'
import MonthCalendar from '@/components/MonthCalendar'
import ClientSwitcher from '@/components/ClientSwitcher'
import FilterMenu from '@/components/FilterMenu'
import Drawer from '@/components/Drawer'
import NewPostForm from './NewPostForm'
import { transitionPostAction } from './approvalActions'
import { addCommentAction, deleteCommentAction } from './commentActions'
import { updatePostAction } from './postActions'
import { addDays, addMonths, mondayOf, monthOf, monthGridDates, monthLabel, weekDates, weekRangeLabel } from '@/lib/week'

type ClientOption = { id: string; name: string }
type Channel = { id: string; type: string; label: string | null }

export default function CalendarBoard({
  clients,
  selectedClientId,
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
  selectedClientId: string
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

  // Client-side filters over the already-loaded (RLS-scoped) posts — no refetch, no
  // query/URL change. State resets on navigation/refresh (not persisted), which is fine.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set())
  const [needsReview, setNeedsReview] = useState(false)

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
    return posts.filter((p) => {
      if (needsReview) {
        if (!review.includes(p.status)) return false
      } else if (statusFilter.size > 0 && !statusFilter.has(p.status)) {
        return false
      }
      if (channelFilter.size > 0 && !channelFilter.has(p.channel_id ?? '__none__')) return false
      return true
    })
  }, [posts, needsReview, statusFilter, channelFilter, isAgency])

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

  function go(overrides: Record<string, string>) {
    const sp = new URLSearchParams(params.toString())
    sp.set('client', selectedClientId)
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
          <ClientSwitcher clients={clients} current={selectedClientId} />
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
        {anyFilter && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-[#9398A1]">Showing {filtered.length} of {posts.length}</span>
            <button onClick={clearFilters} className="text-xs text-[#5A5E66] hover:underline cursor-pointer">Clear filters</button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">
          ⚠️ Couldn&rsquo;t load posts. Please refresh.
        </div>
      )}

      {view === 'week' ? (
        <Calendar
          items={filtered}
          weekDates={weekDates(monday)}
          todayStr={todayStr}
          onSelect={setSelected}
          onNewPost={(d) => setFormDate(d)}
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
        />
      )}

      <Drawer
        item={selected}
        onClose={() => setSelected(null)}
        transitionAction={transitionPostAction}
        updatePostAction={updatePostAction}
        addCommentAction={addCommentAction}
        deleteCommentAction={deleteCommentAction}
        channels={channelsByClient[selectedClientId] ?? []}
        clientId={selectedClientId}
        currentUserId={currentUserId}
        isAgency={isAgency}
      />

      {formDate !== null && (
        <NewPostForm
          clients={clients}
          channelsByClient={channelsByClient}
          defaultClientId={selectedClientId}
          defaultDate={formDate}
          onClose={() => setFormDate(null)}
        />
      )}
    </>
  )
}

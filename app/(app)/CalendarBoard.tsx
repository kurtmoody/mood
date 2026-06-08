'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Calendar, { type Item } from '@/components/Calendar'
import MonthCalendar from '@/components/MonthCalendar'
import ClientSwitcher from '@/components/ClientSwitcher'
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
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Item | null>(null)
  const [formDate, setFormDate] = useState<string | null>(null)

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

      {view === 'week' ? (
        <Calendar
          items={posts}
          weekDates={weekDates(monday)}
          todayStr={todayStr}
          onSelect={setSelected}
          onNewPost={(d) => setFormDate(d)}
        />
      ) : (
        <MonthCalendar
          items={posts}
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

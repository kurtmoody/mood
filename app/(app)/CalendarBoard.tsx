'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Calendar from '@/components/Calendar'
import ClientSwitcher from '@/components/ClientSwitcher'
import NewPostForm from './NewPostForm'
import { addDays, mondayOf, weekRangeLabel } from '@/lib/week'

type ClientOption = { id: string; name: string }
type Channel = { id: string; type: string; label: string | null }

export default function CalendarBoard({
  clients,
  selectedClientId,
  channelsByClient,
  posts,
  monday,
  weekDates,
  todayStr,
}: {
  clients: ClientOption[]
  selectedClientId: string
  channelsByClient: Record<string, Channel[]>
  posts: React.ComponentProps<typeof Calendar>['items']
  monday: string
  weekDates: string[]
  todayStr: string
}) {
  const router = useRouter()
  // null = closed; '' or a datetime string = open (with optional prefill)
  const [formDate, setFormDate] = useState<string | null>(null)

  function goWeek(targetMonday: string) {
    router.push(`/?client=${selectedClientId}&week=${targetMonday}`)
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <ClientSwitcher clients={clients} current={selectedClientId} />
          <div className="text-sm text-[#5A5E66] mt-1.5">{weekRangeLabel(monday)}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-sm text-[#5A5E66]">
            <button onClick={() => goWeek(addDays(monday, -7))} aria-label="Previous week" className="px-2.5 py-2 hover:bg-[#F4F4F6]">‹</button>
            <button onClick={() => goWeek(mondayOf(todayStr))} className="px-3 py-2 border-x border-[#E2E2E5] hover:bg-[#F4F4F6]">Today</button>
            <button onClick={() => goWeek(addDays(monday, 7))} aria-label="Next week" className="px-2.5 py-2 hover:bg-[#F4F4F6]">›</button>
          </div>
          <button
            onClick={() => setFormDate('')}
            className="shrink-0 bg-[#15171C] text-white rounded-lg px-3.5 py-2 text-sm font-semibold"
          >
            New post
          </button>
        </div>
      </div>

      <Calendar items={posts} weekDates={weekDates} todayStr={todayStr} onNewPost={(d) => setFormDate(d)} />

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

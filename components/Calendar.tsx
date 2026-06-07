'use client'
import { useState } from 'react'
import Drawer from './Drawer'

export type Item = {
  id: string
  title: string | null
  content_type: string
  scheduled_at: string | null
  status: string
  body: string | null
  channel: { type: string; label: string | null } | null
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const STATUS: Record<string, { dot: string; label: string }> = {
  approved:          { dot: '#16A34A', label: 'Approved' },
  scheduled:         { dot: '#3B82F6', label: 'Scheduled' },
  client_review:     { dot: '#E8920C', label: 'Awaiting client' },
  changes_requested: { dot: '#E0572E', label: 'Changes requested' },
  internal_review:   { dot: '#8B5CF6', label: 'Internal review' },
  draft:             { dot: '#A6ABB3', label: 'Draft' },
}

function mondayIndex(d: Date) { return (d.getDay() + 6) % 7 }

export default function Calendar({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<Item | null>(null)

  const cols: Item[][] = [[], [], [], [], [], [], []]
  for (const it of items) {
    if (!it.scheduled_at) continue
    cols[mondayIndex(new Date(it.scheduled_at))].push(it)
  }

  return (
    <div className="w-full border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 border-b border-[#ECECEE]">
        {DAYS.map((d) => (
          <div key={d} className="px-3 py-2.5 text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold border-r border-[#ECECEE] last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cols.map((dayItems, i) => (
          <div key={i} className="min-h-[520px] border-r border-[#ECECEE] last:border-r-0 p-2 flex flex-col gap-2">
            {dayItems.map((it) => {
              const s = STATUS[it.status] ?? STATUS.draft
              const time = it.scheduled_at
                ? new Date(it.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : ''
              return (
                <button
                  key={it.id}
                  onClick={() => setSelected(it)}
                  className="text-left border border-[#ECECEE] rounded-xl bg-white shadow-sm hover:shadow-md transition p-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#15171C]/15"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold capitalize">{it.channel?.type ?? it.content_type}</span>
                    <span className="text-[11px] text-[#9398A1]">{time}</span>
                  </div>
                  <div className="text-[12.5px] leading-snug mb-2">{it.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#9398A1]">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                    {s.label}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
          </div>
        </div>
      </div>

      <Drawer item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

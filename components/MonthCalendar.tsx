'use client'

import { Image as ImageIcon, Link2 } from 'lucide-react'
import { maltaDate, mondayOf, monthOf } from '@/lib/week'
import { textOn } from '@/lib/colour'
import { STATUS, type Item } from './Calendar'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

export default function MonthCalendar({
  items,
  gridDates,
  month,
  todayStr,
  onSelect,
  onNewPost,
  onShowWeek,
  isAgency,
  onReschedule,
}: {
  items: Item[]
  gridDates: string[]
  month: string
  todayStr?: string
  onSelect: (item: Item) => void
  onNewPost?: (prefill: string) => void
  onShowWeek: (monday: string) => void
  isAgency?: boolean
  onReschedule?: (item: Item, targetDate: string) => void
}) {
  // Agency-only drag-to-reschedule (see Calendar.tsx for the same pattern).
  const dragEnabled = !!isAgency && !!onReschedule
  function onDrop(targetDate: string, e: React.DragEvent) {
    if (!dragEnabled) return
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const it = items.find((p) => p.id === id)
    if (it) onReschedule!(it, targetDate)
  }
  const byDate = new Map<string, Item[]>()
  for (const it of items) {
    if (!it.scheduled_at) continue
    const d = maltaDate(it.scheduled_at)
    const arr = byDate.get(d)
    if (arr) arr.push(it)
    else byDate.set(d, [it])
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
            {gridDates.map((date) => {
              const dayItems = byDate.get(date) ?? []
              const inMonth = monthOf(date) === month
              const isToday = date === todayStr
              const dayNum = Number(date.slice(8, 10))
              const extra = dayItems.length - MAX_CHIPS
              return (
                <div
                  key={date}
                  onClick={() => onNewPost?.(`${date}T09:00`)}
                  onDragOver={dragEnabled ? (e) => e.preventDefault() : undefined}
                  onDrop={dragEnabled ? (e) => onDrop(date, e) : undefined}
                  className={`min-h-[120px] border-r border-b border-[#ECECEE] [&:nth-child(7n)]:border-r-0 p-1.5 flex flex-col gap-1 cursor-pointer ${
                    isToday ? 'bg-[#F2F6FF]' : inMonth ? 'hover:bg-[#FBFBFC]/60' : 'bg-[#FBFBFC]'
                  }`}
                >
                  <div className="px-1">
                    <span
                      className={`text-[12px] ${
                        isToday
                          ? 'inline-grid place-items-center w-5 h-5 rounded-full bg-[#15171C] text-white font-semibold'
                          : inMonth
                            ? 'text-[#15171C]'
                            : 'text-[#C0C4CC]'
                      }`}
                    >
                      {dayNum}
                    </span>
                  </div>

                  {dayItems.slice(0, MAX_CHIPS).map((it) => {
                    const s = STATUS[it.status] ?? STATUS.draft
                    const label = it.title || it.channel?.label || it.channel?.type || it.content_type
                    const colour = it.clientColour ?? '#FFFFFF'
                    const fg = textOn(colour)
                    const ring = fg === '#FFFFFF' ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.12)'
                    return (
                      <button
                        key={it.id}
                        onClick={(e) => { e.stopPropagation(); onSelect(it) }}
                        draggable={dragEnabled}
                        onDragStart={dragEnabled ? (e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
                        title={it.clientName ?? undefined}
                        style={{ background: colour, color: fg }}
                        className={`flex items-center gap-1.5 w-full text-left rounded-md px-1.5 py-1 text-[11px] cursor-pointer ${dragEnabled ? 'active:cursor-grabbing' : ''} ${it.archived ? 'opacity-50' : ''}`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dot, boxShadow: `0 0 0 1px ${ring}` }} />
                        <span className="truncate min-w-0">{label}</span>
                        {it.archived && <span className="shrink-0 text-[9px] uppercase tracking-wide font-semibold rounded px-1" style={{ background: 'rgba(0,0,0,.12)' }}>Arch</span>}
                        {((it.media && it.media.length > 0) || (it.asset_links && it.asset_links.length > 0)) && (
                          <span className="shrink-0 ml-auto flex items-center gap-0.5" style={{ opacity: 0.75 }}>
                            {it.media && it.media.length > 0 && <ImageIcon size={11} aria-label="Has media" />}
                            {it.asset_links && it.asset_links.length > 0 && <Link2 size={11} aria-label="Has asset links" />}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {extra > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onShowWeek(mondayOf(date)) }}
                      className="text-left px-1.5 text-[11px] text-[#5A5E66] hover:underline cursor-pointer"
                    >
                      +{extra} more
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

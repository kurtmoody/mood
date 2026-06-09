'use client'
import { maltaDate } from '@/lib/week'
import { textOn } from '@/lib/colour'
import MediaThumb from './MediaThumb'

export type Media = {
  id: string
  storage_path: string
  mime_type: string | null
  created_at: string
  url: string | null
}

export type ApprovalEvent = {
  id: string
  action: string
  note: string | null
  created_at: string
  actor: string | null
}

export type Comment = {
  id: string
  body: string
  created_at: string
  author_id: string | null
  author: string
}

export type VersionDetail = {
  id: string
  version_no: number
  body: string | null
  created_at: string
  author: string | null
  isCurrent: boolean
  media: Media[]
  events: { action: string; created_at: string }[]
}

export type Item = {
  id: string
  client_id: string
  title: string | null
  content_type: string
  scheduled_at: string | null
  status: string
  body: string | null
  channel_id: string | null
  current_version_id: string | null
  version_no?: number
  channel: { type: string; label: string | null } | null
  events?: ApprovalEvent[]
  comments?: Comment[]
  media?: Media[]
  versions?: VersionDetail[]
  clientColour?: string
  clientName?: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const STATUS: Record<string, { dot: string; label: string }> = {
  approved:          { dot: '#16A34A', label: 'Approved' },
  scheduled:         { dot: '#3B82F6', label: 'Scheduled' },
  client_review:     { dot: '#E8920C', label: 'Awaiting client' },
  changes_requested: { dot: '#E0572E', label: 'Changes requested' },
  internal_review:   { dot: '#8B5CF6', label: 'Internal review' },
  draft:             { dot: '#A6ABB3', label: 'Draft' },
  posted:            { dot: '#0D9488', label: 'Posted' },
}

export default function Calendar({
  items,
  weekDates,
  todayStr,
  onSelect,
  onNewPost,
}: {
  items: Item[]
  weekDates: string[]
  todayStr?: string
  onSelect: (item: Item) => void
  onNewPost?: (prefill: string) => void
}) {
  // Bucket posts by their actual Malta date; only this week's 7 dates render.
  const byDate = new Map<string, Item[]>()
  for (const it of items) {
    if (!it.scheduled_at) continue
    const d = maltaDate(it.scheduled_at)
    const arr = byDate.get(d)
    if (arr) arr.push(it)
    else byDate.set(d, [it])
  }
  const cols = weekDates.map((ds) => byDate.get(ds) ?? [])

  return (
    <div className="w-full border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 border-b border-[#ECECEE]">
        {DAYS.map((d, i) => {
          const isToday = weekDates[i] === todayStr
          const dayNum = weekDates[i] ? Number(weekDates[i].slice(8, 10)) : ''
          return (
            <div key={d} className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-wide font-semibold border-r border-[#ECECEE] last:border-r-0 ${isToday ? 'text-[#15171C]' : 'text-[#9398A1]'}`}>
              <span>{d}</span>
              <span className={isToday ? 'inline-grid place-items-center w-5 h-5 rounded-full bg-[#15171C] text-white' : 'text-[#5A5E66]'}>{dayNum}</span>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7">
        {cols.map((dayItems, i) => (
          <div
            key={i}
            onClick={() => onNewPost?.(weekDates[i] ? `${weekDates[i]}T09:00` : '')}
            className={`min-h-[520px] border-r border-[#ECECEE] last:border-r-0 p-2 flex flex-col gap-2 cursor-pointer ${weekDates[i] === todayStr ? 'bg-[#F2F6FF]' : 'hover:bg-[#FBFBFC]/60'}`}
          >
            {dayItems.map((it) => {
              const s = STATUS[it.status] ?? STATUS.draft
              const time = it.scheduled_at
                ? new Date(it.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : ''
              const colour = it.clientColour ?? '#FFFFFF'
              const fg = textOn(colour)
              const ring = fg === '#FFFFFF' ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.12)'
              return (
                <button
                  key={it.id}
                  onClick={(e) => { e.stopPropagation(); onSelect(it) }}
                  title={it.clientName ?? undefined}
                  style={{ background: colour, color: fg }}
                  className="text-left rounded-xl shadow-sm hover:shadow-md transition p-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#15171C]/15"
                >
                  {it.media && it.media.length > 0 && <MediaThumb media={it.media} />}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold capitalize">{it.channel?.type ?? it.content_type}</span>
                    <span className="text-[11px]" style={{ opacity: 0.75 }}>{time}</span>
                  </div>
                  <div className="text-[12.5px] leading-snug mb-2">{it.title}</div>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ opacity: 0.9 }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dot, boxShadow: `0 0 0 1.5px ${ring}` }} />
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
    </div>
  )
}

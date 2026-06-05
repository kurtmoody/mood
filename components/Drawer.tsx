'use client'
import { useEffect } from 'react'
import { STATUS, type Item } from './Calendar'

function formatDate(iso: string | null) {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Drawer({ item, onClose }: { item: Item | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

  const s = STATUS[item.status] ?? STATUS.draft
  const channel = item.channel?.label ?? item.channel?.type ?? item.content_type

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[#ECECEE]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold capitalize mb-1">{channel}</div>
            <h2 className="text-lg font-bold leading-snug">{item.title ?? 'Untitled'}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Scheduled</div>
              <div className="text-sm">{formatDate(item.scheduled_at)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Status</div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                {s.label}
              </div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Body</div>
          {item.body
            ? <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#15171C]">{item.body}</div>
            : <div className="text-sm text-[#9398A1] italic">No content yet.</div>}
        </div>
      </div>
    </div>
  )
}

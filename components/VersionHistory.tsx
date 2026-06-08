'use client'

import { useState } from 'react'
import { mediaKind } from '@/lib/media'
import type { Media, VersionDetail } from './Calendar'

// Past-tense labels for a version's approval events (shared wording with the drawer).
const ACTION_PAST: Record<string, string> = {
  submit_internal: 'Submitted for internal review',
  approve_internal: 'Approved & sent to client',
  request_changes: 'Requested changes',
  approve: 'Client-approved',
  schedule: 'Scheduled',
  mark_posted: 'Posted',
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function MiniThumb({ m }: { m: Media }) {
  const [broken, setBroken] = useState(false)
  const kind = mediaKind(m.mime_type)
  if (kind === 'image' && m.url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.url} alt="" loading="lazy" onError={() => setBroken(true)} className="w-12 h-12 object-cover rounded-md border border-[#ECECEE]" />
  }
  if (kind === 'video') return <div className="w-12 h-12 rounded-md bg-[#15171C] grid place-items-center text-white text-[10px]">▶</div>
  if (kind === 'pdf') return <div className="w-12 h-12 rounded-md bg-[#F4F4F6] grid place-items-center text-[#5A5E66] text-[9px] font-semibold">PDF</div>
  return <div className="w-12 h-12 rounded-md bg-[#F4F4F6] grid place-items-center text-[#9398A1] text-[9px]">—</div>
}

// Agency-only version history. Renders nothing for a single-version post.
export default function VersionHistory({ versions }: { versions: VersionDetail[] }) {
  const [open, setOpen] = useState(false)
  if (versions.length <= 1) return null

  return (
    <div className="mt-7 pt-5 border-t border-[#ECECEE]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold cursor-pointer"
      >
        <span>Version history ({versions.length})</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ol className="mt-3 flex flex-col gap-3">
          {versions.map((v) => (
            <li key={v.id} className="border border-[#ECECEE] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">v{v.version_no}</span>
                {v.isCurrent && (
                  <span className="text-[10px] text-[#16A34A] border border-[#16A34A]/30 rounded-full px-1.5 py-0.5">Current</span>
                )}
                <span className="text-[11px] text-[#9398A1]">{v.author ? `${v.author} · ` : ''}{shortDate(v.created_at)}</span>
              </div>

              {v.events.length > 0 && (
                <div className="flex flex-col gap-0.5 mb-2">
                  {v.events.map((e, i) => (
                    <div key={i} className="text-[12px] text-[#5A5E66]">{ACTION_PAST[e.action] ?? e.action} · {shortDate(e.created_at)}</div>
                  ))}
                </div>
              )}

              {v.body
                ? <div className="text-sm whitespace-pre-wrap text-[#15171C]">{v.body}</div>
                : <div className="text-sm text-[#9398A1] italic">No content.</div>}

              {v.media.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {v.media.map((m) => <MiniThumb key={m.id} m={m} />)}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

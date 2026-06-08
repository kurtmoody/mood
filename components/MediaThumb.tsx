'use client'

import { useState } from 'react'
import { mediaKind } from '@/lib/media'
import type { Media } from './Calendar'

// Small thumbnail of the first media item for the calendar card.
export default function MediaThumb({ media }: { media: Media[] }) {
  const [broken, setBroken] = useState(false)
  if (media.length === 0) return null

  const first = media[0]
  const kind = mediaKind(first.mime_type)
  const extra = media.length - 1

  let inner
  if (kind === 'image' && first.url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    inner = <img src={first.url} alt="" loading="lazy" onError={() => setBroken(true)} className="w-full h-20 object-cover rounded-lg" />
  } else if (kind === 'video') {
    inner = (
      <div className="w-full h-20 rounded-lg bg-[#15171C] grid place-items-center">
        <span className="w-7 h-7 rounded-full bg-white/90 grid place-items-center text-[#15171C] text-[11px]">▶</span>
      </div>
    )
  } else if (kind === 'pdf') {
    inner = <div className="w-full h-20 rounded-lg bg-[#F4F4F6] grid place-items-center text-[#5A5E66] text-[11px]">📄 PDF</div>
  } else {
    inner = <div className="w-full h-20 rounded-lg bg-[#F4F4F6] grid place-items-center text-[#9398A1] text-[11px]">No preview</div>
  }

  return (
    <div className="relative mb-2">
      {inner}
      {extra > 0 && (
        <span className="absolute top-1 right-1 text-[10px] font-semibold bg-black/70 text-white rounded-full px-1.5 py-0.5">+{extra}</span>
      )}
    </div>
  )
}

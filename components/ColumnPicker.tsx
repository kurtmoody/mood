'use client'

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, GripVertical } from 'lucide-react'
import type { ResolvedColumn } from '@/lib/viewColumns'

// Reusable, view-agnostic column control: a popover with a checkbox per column
// (locked columns shown but disabled-on) and drag-to-reorder. Emits the full ordered
// list on any change; the parent owns persistence.
export default function ColumnPicker({
  columns,
  onChange,
}: {
  columns: ResolvedColumn[]
  onChange: (next: ResolvedColumn[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggle(key: string) {
    onChange(columns.map((c) => (c.key === key && c.lockable ? { ...c, hidden: !c.hidden } : c)))
  }

  function reorder(from: string, to: string) {
    if (from === to) return
    const arr = [...columns]
    const fi = arr.findIndex((c) => c.key === from)
    const ti = arr.findIndex((c) => c.key === to)
    if (fi < 0 || ti < 0) return
    const [moved] = arr.splice(fi, 1)
    arr.splice(ti, 0, moved)
    onChange(arr)
  }

  const hiddenCount = columns.filter((c) => c.hidden).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
      >
        <SlidersHorizontal size={14} />
        Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-30 w-60 bg-white border border-[#ECECEE] rounded-xl shadow-lg p-1.5">
          <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
            Drag to reorder
          </div>
          {columns.map((c) => (
            <div
              key={c.key}
              draggable
              onDragStart={() => setDragKey(c.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragKey) reorder(dragKey, c.key)
                setDragKey(null)
              }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F4F4F6] cursor-grab ${dragKey === c.key ? 'opacity-50' : ''}`}
            >
              <GripVertical size={13} className="text-[#C0C4CC] shrink-0" />
              <input
                type="checkbox"
                checked={!c.hidden}
                disabled={!c.lockable}
                onChange={() => toggle(c.key)}
                className="cursor-pointer disabled:cursor-not-allowed"
              />
              <span className={`text-sm ${c.lockable ? 'text-[#15171C]' : 'text-[#9398A1]'}`}>
                {c.label}
                {!c.lockable && <span className="text-[11px] text-[#C0C4CC]"> · always shown</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

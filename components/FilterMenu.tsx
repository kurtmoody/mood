'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type Option = { value: string; label: string }

// Generic multi-select dropdown for the calendar filter bar. Selection state is owned
// by the parent; this is presentation only.
export default function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string
  options: Option[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const count = selected.size

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-[#F4F4F6] ${
          count > 0 ? 'border-[#15171C] text-[#15171C] font-medium' : 'border-[#E2E2E5] text-[#5A5E66]'
        }`}
      >
        {label}
        {count > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#15171C] text-white text-[10px] font-semibold grid place-items-center">{count}</span>
        )}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-52 bg-white border border-[#ECECEE] rounded-xl shadow-lg z-30 p-1.5">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-[#9398A1]">Nothing to filter</div>
          ) : (
            options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F4F4F6] cursor-pointer text-sm">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} className="accent-[#15171C]" />
                <span>{o.label}</span>
              </label>
            ))
          )}
          {count > 0 && (
            <button onClick={onClear} className="w-full text-left px-2 py-1.5 mt-0.5 text-xs text-[#5A5E66] hover:underline cursor-pointer">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

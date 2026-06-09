'use client'

import { useState } from 'react'
import { CLIENT_PALETTE } from '@/lib/colour'

// Colour field for the client forms: preset swatches + a custom hex via a native colour
// input. Writes the chosen value to a hidden input. Left empty on new clients (the
// create action then auto-assigns a stable colour from the name).
export default function ColourPicker({ name = 'calendar_colour', defaultValue }: { name?: string; defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue?.trim() ?? '')
  const [showCustom, setShowCustom] = useState(false)
  const isHex = /^#[0-9a-f]{6}$/i.test(value)
  const isPreset = CLIENT_PALETTE.some((c) => c.toLowerCase() === value.toLowerCase())
  const customOpen = showCustom || (isHex && !isPreset)

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        {CLIENT_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setValue(c); setShowCustom(false) }}
            aria-label={`Colour ${c}`}
            className={`w-6 h-6 rounded-full cursor-pointer ${
              value.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-2 ring-[#15171C]' : 'ring-1 ring-black/5'
            }`}
            style={{ background: c }}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((s) => !s)}
          className={`h-6 px-2.5 rounded-full border text-[11px] font-medium cursor-pointer ${
            customOpen ? 'border-[#15171C] text-[#15171C]' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'
          }`}
        >
          Custom
        </button>
        {customOpen && (
          <input
            type="color"
            value={isHex ? value : '#15171C'}
            onChange={(e) => setValue(e.target.value)}
            className="w-8 h-7 rounded cursor-pointer border border-[#E2E2E5] bg-white p-0.5"
          />
        )}
        <span className="text-[11px] text-[#9398A1] font-mono">{value || 'auto from name'}</span>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import LogTimeModal from './LogTimeModal'

// Top-bar entry point for the global time-logging modal (rendered only for agency users).
// Owns the open state + a brief post-log confirmation.
export default function LogTimeLauncher() {
  const [open, setOpen] = useState(false)
  const [justLogged, setJustLogged] = useState(false)

  return (
    <>
      {justLogged && <span className="hidden sm:inline text-xs text-[#16A34A] font-medium mr-1">Time logged</span>}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong text-muted px-3 py-1.5 text-sm font-medium hover:bg-hover hover:text-ink cursor-pointer"
      >
        <Plus size={15} /> Log time
      </button>
      {open && (
        <LogTimeModal
          onClose={() => setOpen(false)}
          onLogged={() => {
            setOpen(false)
            setJustLogged(true)
            setTimeout(() => setJustLogged(false), 2500)
          }}
        />
      )}
    </>
  )
}

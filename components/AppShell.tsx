'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const STORAGE_KEY = 'mood:sidebar-pinned'

export default function AppShell({ email, isAgency, children }: { email: string; isAgency: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false) // mobile drawer
  const [pinned, setPinned] = useState(true) // desktop pin (default pinned)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) setPinned(saved === 'true')
  }, [])

  function togglePin() {
    setPinned((p) => {
      const next = !p
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-[#15171C]">
      <Sidebar open={open} onClose={() => setOpen(false)} pinned={pinned} onTogglePin={togglePin} isAgency={isAgency} />
      <div className={`transition-[padding] duration-200 ${pinned ? 'lg:pl-60' : 'lg:pl-16'}`}>
        <TopBar onBurger={() => setOpen(true)} email={email} />
        <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </div>
    </div>
  )
}

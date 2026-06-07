'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = email ? email[0]!.toUpperCase() : '?'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        className="w-8 h-8 rounded-full bg-[#15171C] text-white text-sm font-semibold grid place-items-center cursor-pointer"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white border border-[#ECECEE] rounded-xl shadow-lg py-1 z-50">
          <div className="px-3 py-2 text-xs text-[#9398A1] truncate border-b border-[#ECECEE]">{email}</div>
          <button
            onClick={logout}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

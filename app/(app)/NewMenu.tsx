'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { btnPrimary } from '@/components/ui'
import NewCampaignModal from './NewCampaignModal'

type ClientOption = { id: string; name: string }

// The top-right "New ▾" control — replaces the standalone "New post" button wherever it lives.
// "Post" is unchanged (delegates to the caller's onNewPost); "Campaign" opens the global
// create-campaign modal with a client picker. Dropdown closes on click-outside / Escape.
export default function NewMenu({
  clients,
  defaultClientId = '',
  onNewPost,
}: {
  clients: ClientOption[]
  defaultClientId?: string
  onNewPost: () => void
}) {
  const [open, setOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${btnPrimary} inline-flex items-center gap-1.5`}
      >
        New <ChevronDown size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-44 bg-white border border-[#ECECEE] rounded-xl shadow-lg py-1 z-50">
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onNewPost() }}
            className="w-full text-left px-3 py-2 text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
          >
            Post
          </button>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); setCampaignOpen(true) }}
            className="w-full text-left px-3 py-2 text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
          >
            Campaign
          </button>
        </div>
      )}
      {campaignOpen && (
        <NewCampaignModal clients={clients} defaultClientId={defaultClientId} onClose={() => setCampaignOpen(false)} />
      )}
    </div>
  )
}

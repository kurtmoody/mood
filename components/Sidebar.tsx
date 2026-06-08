'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Users, Users2, Pin, type LucideIcon } from 'lucide-react'

type NavItem = { href: string; label: string; icon: LucideIcon; isActive: (path: string) => boolean; agencyOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Calendar', icon: Calendar, isActive: (p) => p === '/' },
  { href: '/clients', label: 'Clients', icon: Users, isActive: (p) => p === '/clients' || p.startsWith('/clients/'), agencyOnly: true },
  { href: '/team', label: 'Team', icon: Users2, isActive: (p) => p === '/team' || p.startsWith('/team/'), agencyOnly: true },
]

export default function Sidebar({
  open,
  onClose,
  pinned,
  onTogglePin,
  isAgency,
}: {
  open: boolean
  onClose: () => void
  pinned: boolean
  onTogglePin: () => void
  isAgency: boolean
}) {
  const pathname = usePathname()
  const navItems = NAV_ITEMS.filter((i) => isAgency || !i.agencyOnly)
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered // desktop: rail expands on hover when unpinned

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={onClose} />}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-[#ECECEE] flex flex-col overflow-hidden transition-[width,transform] duration-200 ease-in-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${expanded ? 'lg:w-60' : 'lg:w-16'} ${!pinned && hovered ? 'lg:shadow-xl' : ''}`}
      >
        <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-[#ECECEE]">
          <span className="font-bold text-lg whitespace-nowrap">Mood</span>
          {expanded && (
            <button
              onClick={onTogglePin}
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
              className={`hidden lg:inline-flex shrink-0 p-1.5 rounded-lg cursor-pointer ${
                pinned ? 'bg-[#F4F4F6] text-[#15171C]' : 'text-[#9398A1] hover:bg-[#F4F4F6]'
              }`}
            >
              <Pin size={16} />
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                title={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

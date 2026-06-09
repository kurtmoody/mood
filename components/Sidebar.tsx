'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, LayoutDashboard, ListChecks, Users, Users2, Settings, Pin, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; label: string; icon: LucideIcon; isActive: (path: string) => boolean; agencyOnly?: boolean; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Calendar', icon: Calendar, isActive: (p) => p === '/' },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: (p) => p === '/dashboard', agencyOnly: true },
  { href: '/tasks', label: 'Tasks', icon: ListChecks, isActive: (p) => p === '/tasks' || p.startsWith('/tasks/'), agencyOnly: true },
  { href: '/clients', label: 'Clients', icon: Users, isActive: (p) => p === '/clients' || p.startsWith('/clients/'), agencyOnly: true },
  { href: '/team', label: 'Team', icon: Users2, isActive: (p) => p === '/team' || p.startsWith('/team/'), agencyOnly: true },
  { href: '/admin', label: 'Admin', icon: Settings, isActive: (p) => p === '/admin' || p.startsWith('/admin/'), adminOnly: true },
]

export default function Sidebar({
  open,
  onClose,
  pinned,
  onTogglePin,
  isAgency,
  isAgencyAdmin,
}: {
  open: boolean
  onClose: () => void
  pinned: boolean
  onTogglePin: () => void
  isAgency: boolean
  isAgencyAdmin: boolean
}) {
  const pathname = usePathname()
  const navItems = NAV_ITEMS.filter((i) => {
    if (i.adminOnly && !isAgencyAdmin) return false
    if (i.agencyOnly && !isAgency) return false
    return true
  })
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered // desktop: rail expands on hover when unpinned

  // Glanceable "needs your action" count for the Dashboard badge. RLS scopes this to
  // the agency's clients; refetched on navigation so acting on a post updates it.
  const [actionCount, setActionCount] = useState(0)
  useEffect(() => {
    if (!isAgency) return
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { count } = await supabase
        .from('content_item')
        .select('id', { count: 'exact', head: true })
        .in('status', ['internal_review', 'changes_requested'])
      if (!cancelled) setActionCount(count ?? 0)
    })()
    return () => { cancelled = true }
  }, [isAgency, pathname])

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
          <Link href="/" aria-label="Mood home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Mood" className="h-7 w-auto" />
          </Link>
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
            const badge = href === '/dashboard' ? actionCount : 0
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
                <span className="relative shrink-0">
                  <Icon size={18} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#E0572E] text-white text-[9px] font-semibold grid place-items-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

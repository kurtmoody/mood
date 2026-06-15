'use client'

import { Menu } from 'lucide-react'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import LogTimeLauncher from './LogTimeLauncher'

export default function TopBar({ onBurger, email, isAgency }: { onBurger: () => void; email: string; isAgency: boolean }) {
  return (
    <header className="h-14 sticky top-0 z-20 bg-[#FBFBFC]/80 backdrop-blur border-b border-[#ECECEE] flex items-center justify-between px-4 sm:px-6 lg:px-8">
      <button
        onClick={onBurger}
        aria-label="Open menu"
        className="lg:hidden -ml-2 p-2 text-[#5A5E66] hover:text-[#15171C] cursor-pointer"
      >
        <Menu size={20} />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {isAgency && <LogTimeLauncher />}
        <NotificationBell />
        <UserMenu email={email} />
      </div>
    </header>
  )
}

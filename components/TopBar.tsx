'use client'

import { Menu } from 'lucide-react'
import UserMenu from './UserMenu'

export default function TopBar({ onBurger, email }: { onBurger: () => void; email: string }) {
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
      <UserMenu email={email} />
    </header>
  )
}

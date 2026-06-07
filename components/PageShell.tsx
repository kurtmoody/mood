import type { ReactNode } from 'react'
import Nav from './Nav'

export default function PageShell({
  current,
  children,
}: {
  current: 'calendar' | 'clients' | 'team'
  children: ReactNode
}) {
  return (
    <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 min-h-screen bg-[#FBFBFC] text-[#15171C]">
      <Nav current={current} />
      {children}
    </main>
  )
}

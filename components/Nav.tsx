import Link from 'next/link'
import LogoutButton from './LogoutButton'

const TABS = [
  { href: '/', key: 'calendar', label: 'Calendar' },
  { href: '/clients', key: 'clients', label: 'Clients' },
  { href: '/team', key: 'team', label: 'Team' },
] as const

export default function Nav({ current }: { current: 'calendar' | 'clients' | 'team' }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <nav className="flex items-center gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`text-sm rounded-lg px-3 py-1.5 ${
              current === t.key
                ? 'bg-[#15171C] text-white font-semibold'
                : 'text-[#5A5E66] hover:bg-[#F4F4F6]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <LogoutButton />
    </div>
  )
}

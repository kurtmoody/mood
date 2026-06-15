import Link from 'next/link'

export type ReportTab = 'time' | 'capacity' | 'profitability'

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'time', label: 'Time' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'profitability', label: 'Profitability' },
]

// Tab switcher for /reports — one report at a time. The Profitability tab renders ONLY for
// agency admins. Each tab is a plain ?report navigation that preserves every other param
// (range/from/to/clients/people/cap) via the same merge the capacity presets use; scroll={false}
// keeps the page from jumping to the top on switch. Mirrors the calendar's Week/Month/Table pill.
export default function ReportTabs({
  active,
  isAgencyAdmin,
  basePath = '/reports',
  params = {},
}: {
  active: ReportTab
  isAgencyAdmin: boolean
  basePath?: string
  params?: Record<string, string | undefined>
}) {
  const href = (report: ReportTab) => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v != null && k !== 'report') usp.set(k, v)
    usp.set('report', report)
    return `${basePath}?${usp.toString()}`
  }
  const tabs = TABS.filter((t) => t.key !== 'profitability' || isAgencyAdmin)

  return (
    <div className="mb-6 flex w-fit items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          scroll={false}
          className={`px-3 py-2 ${active === t.key ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

import Link from 'next/link'

// Add future admin modules (task templates, …) by appending here.
const SECTIONS = [
  { href: '/admin/raci', title: 'RACI matrix', desc: "Who's accountable for each task type." },
  { href: '/admin/access', title: 'Team access', desc: 'Who can administer Mood.' },
  { href: '/admin/costs', title: 'Cost per hour', desc: 'Blended internal rate for profitability.' },
]

export default function AdminPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="text-sm text-[#9398A1] mt-1 mb-8">Agency configuration. Admin-only.</p>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="block border border-[#ECECEE] rounded-xl bg-white px-5 py-4 hover:shadow-md transition"
          >
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="text-sm text-[#5A5E66] mt-0.5">{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

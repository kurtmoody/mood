import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { mondayOf, maltaDate } from '@/lib/week'

// Statuses that need attention. Deliberately excludes draft (still being worked) and
// approved/scheduled/posted (done).
const NEEDS_ACTION = ['internal_review', 'changes_requested']
const AWAITING = ['client_review']
const AGING_DAYS = 3 // awaiting-client items older than this are flagged

const STATUS_META: Record<string, { dot: string; label: string }> = {
  internal_review:   { dot: '#8B5CF6', label: 'Internal review' },
  changes_requested: { dot: '#E0572E', label: 'Changes requested' },
  client_review:     { dot: '#E8920C', label: 'Awaiting client' },
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date'
}
function daysLabel(d: number) {
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`
}

type Row = {
  id: string
  title: string
  clientName: string
  channel: string
  status: string
  scheduled_at: string | null
  days: number
  href: string
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // agency-only; clients have no dashboard

  // No client filter: RLS scopes content_item to is_agency_for_client(...), so this
  // returns exactly the agency's clients' posts across ALL of them.
  const { data: items } = await supabase
    .from('content_item')
    .select('id, title, content_type, status, scheduled_at, updated_at, client_id, client:client_id ( name ), channel:channel_id ( type, label ), events:approval_event ( action, created_at )')
    .in('status', [...NEEDS_ACTION, ...AWAITING])

  const now = Date.now()
  const rows: Row[] = (items ?? []).map((it: any) => {
    // Entered-current-status time = latest approval_event (each transition logs one),
    // falling back to updated_at. Drives "how long it's been in this state".
    const latest = (it.events ?? []).reduce(
      (acc: any, e: any) => (!acc || e.created_at > acc.created_at ? e : acc),
      null,
    )
    const enteredAt = latest?.created_at ?? it.updated_at
    const days = enteredAt ? Math.floor((now - new Date(enteredAt).getTime()) / 86_400_000) : 0
    const monday = it.scheduled_at ? mondayOf(maltaDate(it.scheduled_at)) : null
    const href = monday
      ? `/?client=${it.client_id}&week=${monday}&view=week&post=${it.id}`
      : `/?client=${it.client_id}&post=${it.id}`
    return {
      id: it.id,
      title: it.title ?? 'Untitled',
      clientName: it.client?.name ?? '—',
      channel: it.channel?.label ?? it.channel?.type ?? it.content_type,
      status: it.status,
      scheduled_at: it.scheduled_at,
      days,
      href,
    }
  })

  // Oldest first = longest blocked / waiting = most urgent (both sections).
  const byOldest = (a: Row, b: Row) => b.days - a.days
  const needsAction = rows.filter((r) => NEEDS_ACTION.includes(r.status)).sort(byOldest)
  const awaiting = rows.filter((r) => AWAITING.includes(r.status)).sort(byOldest)

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-[#9398A1] mt-1 mb-8">What needs attention across all your clients.</p>

      <Section title="Needs your action" empty="Nothing needs your action." rows={needsAction} />
      <Section title="Awaiting client" empty="Nothing awaiting client." rows={awaiting} aging />
    </div>
  )
}

function Section({ title, empty, rows, aging }: { title: string; empty: string; rows: Row[]; aging?: boolean }) {
  return (
    <section className="mb-10">
      <h2 className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">{title} ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-[#9398A1] border border-dashed border-[#ECECEE] rounded-xl px-4 py-6 text-center">{empty}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const meta = STATUS_META[r.status]
            const isAging = aging && r.days > AGING_DAYS
            return (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="flex items-center gap-3 border border-[#ECECEE] rounded-xl bg-white px-4 py-3 hover:shadow-md transition"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta?.dot ?? '#A6ABB3' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold truncate">{r.title}</span>
                      <span className="text-[12px] text-[#9398A1] shrink-0">{r.clientName}</span>
                    </div>
                    <div className="text-[12px] text-[#9398A1]">
                      <span className="capitalize">{r.channel}</span> · {meta?.label ?? r.status} · {fmtDate(r.scheduled_at)}
                    </div>
                  </div>
                  <span className={`text-[12px] shrink-0 ${isAging ? 'text-[#E0572E] font-semibold' : 'text-[#9398A1]'}`}>
                    {daysLabel(r.days)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

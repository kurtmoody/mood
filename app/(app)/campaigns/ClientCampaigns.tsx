import Link from 'next/link'
import { CLIENT_PHASE_LABEL } from '@/lib/campaignConstants'

// The client-facing campaign list. Fed only by get_client_campaigns (whitelisted, member-only,
// production/live/wrapped) — no tasks, objective, fee, or brief here.
export type ClientCampaignRow = {
  id: string
  clientId: string
  clientName: string
  name: string
  phase: string
  start_date: string | null
  end_date: string | null
  media_budget: number | null
}

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

function dateRange(start: string | null, end: string | null): string | null {
  const s = fmtDate(start)
  const e = fmtDate(end)
  if (s && e) return `${s} – ${e}`
  if (s) return `From ${s}`
  if (e) return `Until ${e}`
  return null
}

function PhasePill({ phase }: { phase: string }) {
  const tint =
    phase === 'live' ? 'bg-[#ECFDF3] text-[#16A34A]'
    : phase === 'production' ? 'bg-[#EEF2FF] text-[#4F46E5]'
    : 'bg-[#FEF3E9] text-[#C2410C]' // wrapped
  return <span className={`text-[11px] rounded-full px-2 py-0.5 ${tint}`}>{CLIENT_PHASE_LABEL[phase] ?? phase}</span>
}

function Row({ c }: { c: ClientCampaignRow }) {
  const range = dateRange(c.start_date, c.end_date)
  return (
    <Link
      href={`/campaigns/view/${c.id}`}
      className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4 hover:bg-[#FBFBFC]"
    >
      <div className="min-w-0 flex items-center gap-2.5">
        <span className="text-sm font-semibold truncate">{c.name}</span>
        <PhasePill phase={c.phase} />
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
        {c.media_budget != null && <span>€{c.media_budget.toLocaleString('en-GB')} budget</span>}
        {range && <span>{range}</span>}
      </div>
    </Link>
  )
}

export default function ClientCampaigns({ campaigns, multiClient }: { campaigns: ClientCampaignRow[]; multiClient: boolean }) {
  const groups = new Map<string, { clientName: string; items: ClientCampaignRow[] }>()
  for (const c of campaigns) {
    let g = groups.get(c.clientId)
    if (!g) { g = { clientName: c.clientName, items: [] }; groups.set(c.clientId, g) }
    g.items.push(c)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xl font-bold">Campaigns</div>
        <div className="text-sm text-[#5A5E66]">Your active campaigns</div>
      </div>

      {campaigns.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center text-sm text-[#5A5E66]">
          No active campaigns yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.values()].map((g) => (
            <div key={g.clientName}>
              {multiClient && <div className="text-sm font-semibold text-[#5A5E66] mb-2">{g.clientName}</div>}
              <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
                {g.items.map((c) => <Row key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

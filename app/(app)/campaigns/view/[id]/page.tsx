import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { maltaDate } from '@/lib/week'
import { CLIENT_PHASE_LABEL } from '@/lib/campaignConstants'
import { computeTimeline } from '@/lib/campaignTimeline'
import PageContainer from '@/components/PageContainer'
import CampaignTimeline from '../../[id]/CampaignTimeline'

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

function dateRange(start: string | null, end: string | null): string {
  const s = fmtDate(start)
  const e = fmtDate(end)
  if (s && e) return `${s} – ${e}`
  if (s) return `From ${s}`
  if (e) return `Until ${e}`
  return 'No dates set'
}

function postedDate(datePosted: string | null, scheduled: string | null): string {
  if (datePosted) return fmtDate(datePosted) ?? '—'
  return scheduled ? (fmtDate(maltaDate(scheduled)) ?? '—') : '—'
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function money(n: number | null): string {
  return n == null ? '—' : `€${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}
function count(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('en-GB')
}

// A plain progress meter (server-safe — no hooks).
function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[#F0F0F1] overflow-hidden mt-2">
      <div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-[#9398A1] mt-1">{sub}</div>}
    </div>
  )
}

// The client-facing campaign page. Campaign fields come ONLY from get_client_campaign (whitelist:
// no fee/brief/kpi). Milestones come via their RLS (client can read their campaigns' milestones).
// Posted-for-you content reuses the 0015 content read floor (clients can read `posted` items).
export default async function ClientCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type === 'none') redirect('/')

  // The whitelisted, member-only projection. Non-members get an error; planning/closed yield no row.
  const { data: campaignRows, error } = await supabase.rpc('get_client_campaign', { p_campaign_id: id })
  const campaign = (campaignRows as any[] | null)?.[0]
  if (error || !campaign) redirect('/campaigns')

  const [{ data: milestones }, { data: posted }] = await Promise.all([
    supabase
      .from('campaign_milestone')
      .select('id, title, start_date, end_date, status')
      .eq('campaign_id', id)
      .order('sort_order')
      .order('created_at'),
    // Reuse the content read floor — a client only ever sees their own `posted` items here.
    supabase
      .from('content_item')
      .select('id, title, status, scheduled_at, date_posted, posted_url, channel:channel_id ( type, label )')
      .eq('campaign_id', id)
      .eq('status', 'posted')
      .order('date_posted', { ascending: true, nullsFirst: false })
      .order('scheduled_at', { ascending: true, nullsFirst: false }),
  ])

  const milestoneRows = (milestones ?? []) as { id: string; title: string; start_date: string | null; end_date: string | null; status: string }[]
  const postedRows = (posted ?? []) as { id: string; title: string | null; status: string; scheduled_at: string | null; date_posted: string | null; posted_url: string | null; channel: any }[]

  // Milestones-only Gantt — reuse the internal renderer with no tasks / no posts row.
  const timeline = computeTimeline(
    { start_date: campaign.start_date, end_date: campaign.end_date },
    [],
    [],
    milestoneRows.map((m) => ({ id: m.id, title: m.title, status: m.status, start_date: m.start_date, end_date: m.end_date })),
  )

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href="/campaigns" className="text-sm text-[#5A5E66] hover:underline">← Campaigns</Link>
      </div>

      {/* Header */}
      <div className="border border-[#ECECEE] rounded-2xl bg-white p-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold truncate">{campaign.name}</h1>
          <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#ECFDF3] text-[#16A34A]">{CLIENT_PHASE_LABEL[campaign.phase] ?? campaign.phase}</span>
        </div>
        <div className="text-sm text-[#9398A1] mt-2">{dateRange(campaign.start_date, campaign.end_date)}</div>
      </div>

      {/* Stat row — budget · spend · results · cost per result (whitelisted RPC columns only) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard
          label="Agreed ad budget"
          value={campaign.media_budget != null ? money(Number(campaign.media_budget)) : 'Not set'}
        />
        <StatCard
          label="Spent so far"
          value={money(Number(campaign.spent ?? 0))}
          sub={campaign.media_budget != null && Number(campaign.media_budget) > 0
            ? <Meter pct={(Number(campaign.spent ?? 0) / Number(campaign.media_budget)) * 100} />
            : undefined}
        />
        <StatCard
          label="Results so far"
          value={count(Number(campaign.results ?? 0))}
          sub={campaign.kpi_target_results != null
            ? (Number(campaign.kpi_target_results) > 0
                ? <><span>of {count(Number(campaign.kpi_target_results))} target</span><Meter pct={(Number(campaign.results ?? 0) / Number(campaign.kpi_target_results)) * 100} /></>
                : `of ${count(Number(campaign.kpi_target_results))} target`)
            : undefined}
        />
        <StatCard
          label="Cost per result"
          value={Number(campaign.results ?? 0) > 0 ? money(Number(campaign.spent ?? 0) / Number(campaign.results)) : '—'}
        />
      </div>

      {/* Milestone timeline */}
      <div className="mt-6">
        <CampaignTimeline model={timeline} showPosts={false} title="Milestones" />
      </div>

      <div className="mt-6">
        {/* Posted for you */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Posted for you</h2>
            <span className="text-sm text-[#9398A1]">{postedRows.length}</span>
          </div>
          {postedRows.length === 0 ? (
            <div className="border border-[#ECECEE] rounded-2xl bg-white p-8 text-center text-sm text-[#5A5E66]">
              Nothing posted yet.
            </div>
          ) : (
            <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
              {postedRows.map((p) => {
                const ch = Array.isArray(p.channel) ? p.channel[0] : p.channel
                const chLabel = ch ? (ch.label ? `${ch.label} (${cap(ch.type)})` : cap(ch.type)) : null
                return (
                  <div key={p.id} className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.title || 'Untitled'}</div>
                      {chLabel && <div className="text-xs text-[#9398A1] mt-0.5">{chLabel}</div>}
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-[#9398A1]">
                      <span>{postedDate(p.date_posted, p.scheduled_at)}</span>
                      {p.posted_url && (
                        <a href={p.posted_url} target="_blank" rel="noopener noreferrer" className="text-[#4F46E5] hover:underline" onClick={(e) => e.stopPropagation()}>
                          View post ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

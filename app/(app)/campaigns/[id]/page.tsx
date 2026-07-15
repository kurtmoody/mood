import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { mondayOf, maltaDate } from '@/lib/week'
import { STATUS_COLOUR } from '@/lib/taskConstants'
import { STATUS as CONTENT_STATUS } from '@/components/Calendar'
import PageContainer from '@/components/PageContainer'
import CampaignHeader, { type CampaignDetail } from './CampaignHeader'
import BriefPanel from './BriefPanel'

function taskDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}

function postDate(iso: string | null) {
  return iso ? new Date(`${maltaDate(iso)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}

// Deep-link into the calendar drawer for a post (same shape as tasks/page.tsx).
function postHref(clientId: string, id: string, scheduled_at: string | null) {
  return scheduled_at
    ? `/?client=${clientId}&week=${mondayOf(maltaDate(scheduled_at))}&view=week&post=${id}`
    : `/?client=${clientId}&post=${id}`
}

export default async function CampaignHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // internal-only

  const isAdmin = access.isAgencyAdmin

  const [{ data: campaign }, { data: tasks }, { data: content }] = await Promise.all([
    supabase
      .from('campaign')
      .select('id, client_id, name, objective, phase, start_date, end_date, brief, media_budget, fee, kpi_target_results, kpi_target_cost_per_result, brief_approved_at, brief_approved_by, client:client_id ( name )')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('task')
      .select('id, title, status, owner:owner_id ( full_name ), due_date')
      .eq('campaign_id', id)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('content_item')
      .select('id, client_id, title, status, scheduled_at')
      .eq('campaign_id', id)
      .order('scheduled_at', { ascending: true, nullsFirst: false }),
  ])

  if (!campaign) redirect('/clients')

  // Resolve the approver's display name from the team directory (brief_approved_by is an auth uid).
  let approvedByName: string | null = null
  if (campaign.brief_approved_by) {
    const { data: approver } = await supabase
      .from('team_member')
      .select('full_name')
      .eq('user_id', campaign.brief_approved_by)
      .maybeSingle()
    approvedByName = approver?.full_name ?? null
  }

  const cli = (campaign as any).client
  const detail: CampaignDetail = {
    id: campaign.id,
    client_id: campaign.client_id,
    clientName: (Array.isArray(cli) ? cli[0]?.name : cli?.name) ?? 'Client',
    name: campaign.name,
    objective: campaign.objective,
    phase: campaign.phase,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    brief: campaign.brief,
    media_budget: campaign.media_budget,
    fee: campaign.fee,
    kpi_target_results: campaign.kpi_target_results,
    kpi_target_cost_per_result: campaign.kpi_target_cost_per_result,
    brief_approved_at: campaign.brief_approved_at,
    brief_approved_by: campaign.brief_approved_by,
    approvedByName,
  }

  const taskRows = (tasks ?? []) as { id: string; title: string; status: string; owner: any; due_date: string | null }[]
  const contentRows = (content ?? []) as { id: string; client_id: string; title: string | null; status: string; scheduled_at: string | null }[]

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href={`/clients/${detail.client_id}`} className="text-sm text-[#5A5E66] hover:underline">← {detail.clientName}</Link>
      </div>

      <CampaignHeader campaign={detail} isAdmin={isAdmin} />

      <div className="mt-6">
        <BriefPanel campaign={detail} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Tasks */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Tasks</h2>
            <span className="text-sm text-[#9398A1]">{taskRows.length}</span>
          </div>
          {taskRows.length === 0 ? (
            <div className="border border-[#ECECEE] rounded-2xl bg-white p-8 text-center text-sm text-[#5A5E66]">
              No tasks in this campaign.
            </div>
          ) : (
            <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
              {taskRows.map((t) => {
                const owner = Array.isArray(t.owner) ? t.owner[0]?.full_name : t.owner?.full_name
                return (
                  <Link
                    key={t.id}
                    href={`/tasks?client=${detail.client_id}`}
                    className="px-5 py-3 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4 hover:bg-[#FBFBFC]"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOUR[t.status] ?? '#A6ABB3' }} />
                      <span className="text-sm truncate">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
                      {owner && <span>{owner}</span>}
                      <span>{taskDate(t.due_date)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Content */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Content</h2>
            <span className="text-sm text-[#9398A1]">{contentRows.length}</span>
          </div>
          {contentRows.length === 0 ? (
            <div className="border border-[#ECECEE] rounded-2xl bg-white p-8 text-center text-sm text-[#5A5E66]">
              No content in this campaign.
            </div>
          ) : (
            <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
              {contentRows.map((c) => {
                const st = CONTENT_STATUS[c.status]
                return (
                  <Link
                    key={c.id}
                    href={postHref(c.client_id, c.id, c.scheduled_at)}
                    className="px-5 py-3 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4 hover:bg-[#FBFBFC]"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st?.dot ?? '#A6ABB3' }} />
                      <span className="text-sm truncate">{c.title || 'Untitled'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
                      {st && <span>{st.label}</span>}
                      <span>{postDate(c.scheduled_at)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

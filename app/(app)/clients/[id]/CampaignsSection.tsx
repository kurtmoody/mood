'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { createCampaignAction, type CampaignState } from '../../campaignActions'
import { CAMPAIGN_OBJECTIVES, OBJECTIVE_LABEL, PHASE_LABEL, type CampaignObjective, type CampaignPhase } from '@/lib/campaignConstants'
import { labelCls, fieldCls, btnPrimary } from '@/components/ui'

export type Campaign = {
  id: string
  name: string
  objective: string | null
  phase: string
  start_date: string | null
  end_date: string | null
}

const initial: CampaignState = { error: null, ok: false }

// Tint the phase pill along the lifecycle: planning → grey, live → accent, closed → faded.
const PHASE_PILL: Record<CampaignPhase, string> = {
  planning: 'bg-[#F4F4F5] text-[#5A5E66]',
  production: 'bg-[#EEF2FF] text-[#4F46E5]',
  live: 'bg-[#ECFDF3] text-[#16A34A]',
  wrapped: 'bg-[#FEF3E9] text-[#C2410C]',
  closed: 'bg-[#F4F4F5] text-[#9398A1]',
}

export function PhasePill({ phase }: { phase: string }) {
  const p = phase as CampaignPhase
  return (
    <span className={`text-[11px] rounded-full px-2 py-0.5 ${PHASE_PILL[p] ?? 'bg-[#F4F4F5] text-[#5A5E66]'}`}>
      {PHASE_LABEL[p] ?? phase}
    </span>
  )
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

function AddCampaignForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createCampaignAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">New campaign</div>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Name *</label>
          <input name="name" required className={fieldCls} placeholder="Summer launch" />
        </div>
        <div>
          <label className={labelCls}>Objective</label>
          <select name="objective" defaultValue="" className={fieldCls}>
            <option value="">—</option>
            {CAMPAIGN_OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABEL[o as CampaignObjective]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Phase</label>
          {/* Only planning/closed at creation — production onward needs an approved brief (0057 gate). */}
          <select name="phase" defaultValue="planning" className={fieldCls}>
            {(['planning', 'closed'] as const).map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Start date</label>
          <input name="start_date" type="date" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>End date</label>
          <input name="end_date" type="date" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Media budget (€)</label>
          <input name="media_budget" type="number" min="0" step="any" className={fieldCls} placeholder="1000" />
        </div>
        <div>
          <label className={labelCls}>Fee (€) <span className="text-[#9398A1] normal-case">· internal</span></label>
          <input name="fee" type="number" min="0" step="any" className={fieldCls} placeholder="5000" />
        </div>
        <div>
          <label className={labelCls}>KPI target (results)</label>
          <input name="kpi_target_results" type="number" min="0" step="any" className={fieldCls} placeholder="200" />
        </div>
        <div>
          <label className={labelCls}>Target cost / result (€)</label>
          <input name="kpi_target_cost_per_result" type="number" min="0" step="any" className={fieldCls} placeholder="20" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Brief</label>
          <textarea name="brief" rows={3} className={fieldCls} placeholder="Goals, audience, messaging, deliverables…" />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Creating…' : 'Create campaign'}
        </button>
      </div>
    </form>
  )
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const range = dateRange(campaign.start_date, campaign.end_date)
  const obj = campaign.objective as CampaignObjective | null
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4 hover:bg-[#FBFBFC]"
    >
      <div className="min-w-0 flex items-center gap-2.5">
        <span className="text-sm font-semibold truncate">{campaign.name}</span>
        <PhasePill phase={campaign.phase} />
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
        {obj && <span className="text-[#5A5E66]">{OBJECTIVE_LABEL[obj]}</span>}
        {range && <span>{range}</span>}
      </div>
    </Link>
  )
}

export default function CampaignsSection({ clientId, campaigns }: { clientId: string; campaigns: Campaign[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Campaigns</div>
        <div className="text-sm text-[#5A5E66]">{campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}</div>
      </div>

      {campaigns.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No campaigns yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} />)}
        </div>
      )}

      <AddCampaignForm clientId={clientId} />
    </div>
  )
}

'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setCampaignPhaseAction, deleteCampaignAction, type CampaignState } from '../../campaignActions'
import { OBJECTIVE_LABEL, PHASE_LABEL, nextPhase, type CampaignObjective, type CampaignPhase } from '@/lib/campaignConstants'
import { PhasePill } from '../../clients/[id]/CampaignsSection'
import { btnPrimarySm } from '@/components/ui'

export type CampaignDetail = {
  id: string
  client_id: string
  clientName: string
  name: string
  objective: string | null
  phase: string
  start_date: string | null
  end_date: string | null
  brief: string | null
  media_budget: number | null
  fee: number | null
  kpi_target_results: number | null
  kpi_target_cost_per_result: number | null
  brief_approved_at: string | null
  brief_approved_by: string | null
  approvedByName: string | null
}

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

const deleteInitial: CampaignState = { error: null, ok: false }

export default function CampaignHeader({ campaign, isAdmin, taskComplete, taskTotal }: { campaign: CampaignDetail; isAdmin: boolean; taskComplete: number; taskTotal: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = nextPhase(campaign.phase)
  const [delState, delAction, delPending] = useActionState(deleteCampaignAction, deleteInitial)
  // Deleting removes the row this page renders — send the user back to the client.
  useEffect(() => { if (delState.ok) router.push(`/clients/${campaign.client_id}`) }, [delState.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  async function advance() {
    if (!next || busy) return
    setBusy(true); setError(null)
    const r = await setCampaignPhaseAction(campaign.id, {
      name: campaign.name,
      objective: campaign.objective,
      phase: next,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      // Full-overwrite: carry the brief/money/targets through unchanged.
      brief: campaign.brief,
      media_budget: campaign.media_budget,
      fee: campaign.fee,
      kpi_target_results: campaign.kpi_target_results,
      kpi_target_cost_per_result: campaign.kpi_target_cost_per_result,
    })
    setBusy(false)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  const obj = campaign.objective as CampaignObjective | null

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold truncate">{campaign.name}</h1>
            <PhasePill phase={campaign.phase} />
          </div>
          <div className="text-sm text-[#5A5E66] mt-1">
            <Link href={`/clients/${campaign.client_id}`} className="hover:underline">{campaign.clientName}</Link>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-[#5A5E66]">
            <span>{obj ? OBJECTIVE_LABEL[obj] : <span className="text-[#9398A1]">No objective</span>}</span>
            <span className="text-[#9398A1]">{dateRange(campaign.start_date, campaign.end_date)}</span>
          </div>
          {/* Task progress rollup — Complete ÷ total (On Hold counts; it's still work). */}
          <div className="mt-4 max-w-[280px]">
            {taskTotal === 0 ? (
              <div className="text-xs text-[#9398A1]">No tasks yet</div>
            ) : (
              <>
                <div className="flex items-baseline justify-between text-xs text-[#5A5E66] mb-1">
                  <span>{taskComplete} of {taskTotal} tasks complete</span>
                  <span className="text-[#9398A1]">{Math.round((taskComplete / taskTotal) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#F0F0F1] overflow-hidden">
                  <div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${(taskComplete / taskTotal) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          {next ? (
            <button onClick={advance} disabled={busy} className={btnPrimarySm}>
              {busy ? 'Advancing…' : `Advance to ${PHASE_LABEL[next as CampaignPhase]}`}
            </button>
          ) : (
            <span className="text-xs text-[#9398A1]">Campaign closed</span>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
          {isAdmin && campaign.phase === 'closed' && (
            <form action={delAction} onSubmit={(e) => { if (!confirm('Delete this campaign? Its tasks and content will be unlinked, not deleted.')) e.preventDefault() }}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <input type="hidden" name="client_id" value={campaign.client_id} />
              <button type="submit" disabled={delPending} className="text-xs text-[#E0572E] hover:underline disabled:opacity-50">
                {delPending ? 'Deleting…' : 'Delete campaign'}
              </button>
              {delState.error && <span className="text-xs text-red-600 ml-2">{delState.error}</span>}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

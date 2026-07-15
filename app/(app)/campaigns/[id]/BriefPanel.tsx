'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCampaignAction, setBriefApprovedAction, type CampaignState } from '../../campaignActions'
import { kpiLine } from '@/lib/campaignConstants'
import type { CampaignDetail } from './CampaignHeader'
import { labelCls, fieldCls, btnPrimary, btnGhost, btnPrimarySm } from '@/components/ui'

const initial: CampaignState = { error: null, ok: false }

function money(n: number | null): string | null {
  return n == null ? null : `€${n.toLocaleString('en-GB')}`
}

function fmtStamp(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

// The edit form is full-overwrite: it resends name/objective/phase/dates (hidden, unchanged)
// alongside the editable brief/money/target fields, matching update_campaign's semantics.
function EditForm({ campaign, onDone }: { campaign: CampaignDetail; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateCampaignAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="campaign_id" value={campaign.id} />
      <input type="hidden" name="client_id" value={campaign.client_id} />
      <input type="hidden" name="name" value={campaign.name} />
      <input type="hidden" name="objective" value={campaign.objective ?? ''} />
      <input type="hidden" name="phase" value={campaign.phase} />
      <input type="hidden" name="start_date" value={campaign.start_date ?? ''} />
      <input type="hidden" name="end_date" value={campaign.end_date ?? ''} />

      <div>
        <label className={labelCls}>Brief</label>
        <textarea name="brief" rows={5} defaultValue={campaign.brief ?? ''} className={fieldCls} placeholder="Goals, audience, messaging, deliverables…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Media budget (€)</label>
          <input name="media_budget" type="number" min="0" step="any" defaultValue={campaign.media_budget ?? ''} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Fee (€) <span className="text-[#9398A1] normal-case">· internal</span></label>
          <input name="fee" type="number" min="0" step="any" defaultValue={campaign.fee ?? ''} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>KPI target (results)</label>
          <input name="kpi_target_results" type="number" min="0" step="any" defaultValue={campaign.kpi_target_results ?? ''} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Target cost / result (€)</label>
          <input name="kpi_target_cost_per_result" type="number" min="0" step="any" defaultValue={campaign.kpi_target_cost_per_result ?? ''} className={fieldCls} />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Save brief'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

function ApprovalControl({ campaign }: { campaign: CampaignDetail }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const approved = !!campaign.brief_approved_at

  async function toggle(next: boolean) {
    if (busy) return
    setBusy(true); setError(null)
    const r = await setBriefApprovedAction(campaign.id, next)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  if (approved) {
    const who = campaign.approvedByName ?? 'someone'
    const when = fmtStamp(campaign.brief_approved_at)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#ECFDF3] border border-[#CFF3DE] px-4 py-3">
        <div className="text-sm text-[#15803D]">
          Brief approved <span className="text-[#5A5E66]">· {who}{when ? ` · ${when}` : ''}</span>
        </div>
        <button onClick={() => toggle(false)} disabled={busy} className="text-xs text-[#5A5E66] hover:underline disabled:opacity-50">
          {busy ? 'Working…' : 'Un-approve'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FBFBFC] border border-[#ECECEE] px-4 py-3">
      <div className="text-sm text-[#5A5E66]">Brief not yet approved — required before production.</div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button onClick={() => toggle(true)} disabled={busy} className={btnPrimarySm}>
          {busy ? 'Working…' : 'Mark brief approved'}
        </button>
      </div>
    </div>
  )
}

export default function BriefPanel({ campaign }: { campaign: CampaignDetail }) {
  const [editing, setEditing] = useState(false)
  const kpi = kpiLine(campaign.kpi_target_results, campaign.kpi_target_cost_per_result, campaign.objective)

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Brief</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">Edit</button>
        )}
      </div>

      <ApprovalControl campaign={campaign} />

      {editing ? (
        <EditForm campaign={campaign} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-4">
          {campaign.brief ? (
            <p className="text-sm text-ink whitespace-pre-wrap">{campaign.brief}</p>
          ) : (
            <p className="text-sm text-[#9398A1]">No brief written yet.</p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
            <Field label="Media budget" value={money(campaign.media_budget)} />
            <Field label="Fee · internal" value={money(campaign.fee)} />
            <div className="col-span-2">
              <Field label="KPI target" value={kpi} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-0.5">{label}</div>
      <div className="text-sm text-ink">{value ?? <span className="text-[#9398A1]">—</span>}</div>
    </div>
  )
}

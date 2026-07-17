'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { addMetricAction, updateMetricAction, deleteMetricAction, type MetricState } from '../../metricActions'
import { labelCls, fieldClsSm as fieldCls, btnPrimarySm, btnGhost } from '@/components/ui'

export type Metric = {
  id: string
  platform: string
  period_start: string
  period_end: string
  spend: number | null
  impressions: number | null
  reach: number | null
  clicks: number | null
  results: number | null
  source: string
  note: string | null
}

const initial: MetricState = { error: null, ok: false }

const PLATFORM_LABEL: Record<string, string> = { meta: 'Meta', google: 'Google', other: 'Other' }

function money(n: number | null): string {
  return n == null ? '—' : `€${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}
function count(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('en-GB')
}
function pct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`
}
function fmtPeriod(a: string, b: string): string {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000)
}

// CTR and cost-per-result are DISPLAY computations — never stored.
function ctr(clicks: number | null, impressions: number | null): number | null {
  return impressions && impressions > 0 && clicks != null ? (clicks / impressions) * 100 : null
}
function cpr(spend: number | null, results: number | null): number | null {
  return results && results > 0 && spend != null ? spend / results : null
}

function Fields({ m }: { m?: Metric }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={labelCls}>Platform *</label>
        <select name="platform" defaultValue={m?.platform ?? 'meta'} className={fieldCls}>
          {Object.entries(PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Period start *</label>
        <input name="period_start" type="date" defaultValue={m?.period_start ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Period end *</label>
        <input name="period_end" type="date" defaultValue={m?.period_end ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Spend (€)</label>
        <input name="spend" type="number" min="0" step="any" defaultValue={m?.spend ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Impressions</label>
        <input name="impressions" type="number" min="0" step="1" defaultValue={m?.impressions ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Reach</label>
        <input name="reach" type="number" min="0" step="1" defaultValue={m?.reach ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Clicks</label>
        <input name="clicks" type="number" min="0" step="1" defaultValue={m?.clicks ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Results</label>
        <input name="results" type="number" min="0" step="any" defaultValue={m?.results ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Note</label>
        <input name="note" defaultValue={m?.note ?? ''} className={fieldCls} />
      </div>
    </div>
  )
}

function AddForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(addMetricAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])
  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-xl bg-[#FBFBFC] p-4">
      <div className="text-xs font-semibold mb-3">Add metric period</div>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Fields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-3"><button type="submit" disabled={pending} className={btnPrimarySm}>{pending ? 'Adding…' : 'Add'}</button></div>
    </form>
  )
}

function EditForm({ metric, campaignId, onDone }: { metric: Metric; campaignId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateMetricAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <tr><td colSpan={9} className="px-3 py-3 bg-[#FBFBFC]">
      <form action={action}>
        <input type="hidden" name="campaign_id" value={campaignId} />
        <input type="hidden" name="metric_id" value={metric.id} />
        <Fields m={metric} />
        {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimarySm}>{pending ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onDone} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </td></tr>
  )
}

function Row({ metric, campaignId }: { metric: Metric; campaignId: string }) {
  const [editing, setEditing] = useState(false)
  const [delState, delAction] = useActionState(deleteMetricAction, initial)
  if (editing) return <EditForm metric={metric} campaignId={campaignId} onDone={() => setEditing(false)} />
  return (
    <tr className="border-t border-[#F4F4F5]">
      <td className="px-3 py-2 whitespace-nowrap">{fmtPeriod(metric.period_start, metric.period_end)}</td>
      <td className="px-3 py-2">{PLATFORM_LABEL[metric.platform] ?? metric.platform}</td>
      <td className="px-3 py-2 text-right">{money(metric.spend)}</td>
      <td className="px-3 py-2 text-right">{count(metric.impressions)}</td>
      <td className="px-3 py-2 text-right">{count(metric.clicks)}</td>
      <td className="px-3 py-2 text-right">{pct(ctr(metric.clicks, metric.impressions))}</td>
      <td className="px-3 py-2 text-right">{count(metric.results)}</td>
      <td className="px-3 py-2 text-right">{money(cpr(metric.spend, metric.results))}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <span className="text-[11px] text-[#9398A1] mr-3">{metric.source === 'sync' ? 'Synced' : 'Manual'}</span>
        <button onClick={() => setEditing(true)} className="text-[#5A5E66] hover:underline mr-3">Edit</button>
        <form action={delAction} className="inline" onSubmit={(e) => { if (!confirm('Delete this metric row?')) e.preventDefault() }}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <input type="hidden" name="metric_id" value={metric.id} />
          <button type="submit" className="text-[#E0572E] hover:underline">Delete</button>
        </form>
        {delState.error && <span className="text-xs text-red-600 ml-2">{delState.error}</span>}
      </td>
    </tr>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="border border-[#ECECEE] rounded-xl bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-[#9398A1] mt-1">{sub}</div>}
    </div>
  )
}

function Meter({ pct, marker }: { pct: number; marker?: number | null }) {
  const over = marker != null && pct > marker
  return (
    <div className="relative h-1.5 rounded-full bg-[#F0F0F1] overflow-hidden mt-2">
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: over ? '#E0572E' : '#16A34A' }} />
      {marker != null && <div className="absolute top-0 bottom-0 w-px bg-[#15171C]" style={{ left: `${Math.min(marker, 100)}%` }} />}
    </div>
  )
}

export default function ResultsPanel({ campaignId, budget, targetResults, targetCpr, startDate, endDate, today, metrics }: {
  campaignId: string
  budget: number | null
  targetResults: number | null
  targetCpr: number | null
  startDate: string | null
  endDate: string | null
  today: string
  metrics: Metric[]
}) {
  const totalSpend = metrics.reduce((s, m) => s + (m.spend ?? 0), 0)
  const totalResults = metrics.reduce((s, m) => s + (m.results ?? 0), 0)
  const hasSpend = metrics.some((m) => m.spend != null)
  const hasResults = metrics.some((m) => m.results != null)

  const spendPct = budget && budget > 0 ? (totalSpend / budget) * 100 : null
  // Pacing: how far through the flight window are we (only when the campaign has a valid window)?
  let elapsedPct: number | null = null
  if (startDate && endDate && daysBetween(startDate, endDate) > 0) {
    const total = daysBetween(startDate, endDate)
    const done = daysBetween(startDate, today)
    elapsedPct = Math.max(0, Math.min(100, (done / total) * 100))
  }
  const blendedCpr = totalResults > 0 ? totalSpend / totalResults : null

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-6 flex flex-col gap-5">
      <h2 className="text-lg font-bold">Results</h2>

      {/* Headline stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Spend vs budget"
          value={hasSpend ? money(totalSpend) : '—'}
          sub={
            budget != null ? (
              <>
                <div>of {money(budget)}{spendPct != null ? ` · ${spendPct.toFixed(0)}%` : ''}</div>
                {spendPct != null && <Meter pct={spendPct} marker={elapsedPct} />}
                {elapsedPct != null && <div className="mt-1">{elapsedPct.toFixed(0)}% of the flight elapsed</div>}
              </>
            ) : 'No budget set'
          }
        />
        <Stat
          label="Results vs target"
          value={hasResults ? count(totalResults) : '—'}
          sub={
            targetResults != null
              ? <>of {count(targetResults)} target{targetResults > 0 && <Meter pct={(totalResults / targetResults) * 100} />}</>
              : 'No target set'
          }
        />
        <Stat
          label="Cost per result"
          value={money(blendedCpr)}
          sub={targetCpr != null ? `Target ≤ ${money(targetCpr)}` : 'No target set'}
        />
      </div>

      {/* Rows */}
      {metrics.length > 0 && (
        <div className="border border-[#ECECEE] rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1]">
                <th className="px-3 py-2 font-semibold">Period</th>
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-3 py-2 font-semibold text-right">Spend</th>
                <th className="px-3 py-2 font-semibold text-right">Impr.</th>
                <th className="px-3 py-2 font-semibold text-right">Clicks</th>
                <th className="px-3 py-2 font-semibold text-right">CTR</th>
                <th className="px-3 py-2 font-semibold text-right">Results</th>
                <th className="px-3 py-2 font-semibold text-right">CPR</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => <Row key={m.id} metric={m} campaignId={campaignId} />)}
            </tbody>
          </table>
        </div>
      )}

      <AddForm campaignId={campaignId} />
    </div>
  )
}

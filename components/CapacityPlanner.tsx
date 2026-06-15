import Link from 'next/link'
import type { CapModel } from '@/lib/capacity'

// Read-only capacity report: a team/per-person utilisation summary (everyone, idle = free)
// above a per-week grid (where-in-time detail, loaded members only). Each cell + bar is a
// fullness bar (allocated vs capacity) — muted under, accent at/over. Honesty buckets
// (unscheduled hours / unestimated count / on-hold count) sit at each grid row's end.

const PRESETS: { n: number; label: string }[] = [
  { n: 5, label: '5 weeks' },
  { n: 8, label: '8 weeks' },
  { n: 13, label: '3 months' },
  { n: 26, label: '6 months' },
  { n: 52, label: '12 months' },
]

function fmtHours(h: number): string {
  // Avoid noisy decimals: whole numbers plain, else one decimal.
  return (Math.round(h * 10) / 10).toString()
}

// Utilisation colour, same thresholds as the cells: blue under, amber near full, red at/over.
function pctColour(pct: number): string {
  return pct >= 100 ? '#E0572E' : pct >= 85 ? '#E8920C' : '#3B82F6'
}

function UtilBar({ pct }: { pct: number }) {
  return (
    <span className="block h-1.5 rounded-full bg-[#F0F0F2] overflow-hidden">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pctColour(pct) }} />
    </span>
  )
}

function Cell({ hours, capacity }: { hours: number; capacity: number }) {
  if (!hours) return <span className="text-[#C0C4CC]">·</span>
  const ratio = capacity > 0 ? hours / capacity : 0
  const over = ratio >= 1
  const fill = Math.min(ratio, 1) * 100
  const colour = over ? '#E0572E' : ratio >= 0.85 ? '#E8920C' : '#3B82F6'
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[11px] ${over ? 'font-semibold text-[#E0572E]' : 'text-[#5A5E66]'}`}>
        {fmtHours(hours)}<span className="text-[#C0C4CC]">/{capacity}</span>
      </span>
      <span className="block h-1 rounded-full bg-[#F0F0F2] overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${fill}%`, background: colour }} />
      </span>
    </div>
  )
}

export default function CapacityPlanner({
  model,
  n,
  mode,
  basePath = '/reports',
  params = {},
}: {
  model: CapModel
  n: number
  mode: 'week' | 'month'
  basePath?: string
  params?: Record<string, string | undefined>
}) {
  const { columns, rows, summary } = model
  // Switching the capacity preset changes only ?cap — every other query param (the Time
  // report's ?range/?from/?to/?clients/?people) is preserved via a merge. No #capacity hash:
  // a hash makes next/link treat the click as an in-page anchor (cached RSC, no re-render), so
  // the figures wouldn't update. Plain ?cap navigation re-renders; scroll={false} keeps position.
  const href = (cap: number) => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v != null && k !== 'cap') usp.set(k, v)
    usp.set('cap', String(cap))
    return `${basePath}?${usp.toString()}`
  }

  // Summary lists everyone (most-loaded first); the grid only the loaded (no empty rows).
  const summaryRows = [...rows].sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
  const gridRows = rows.filter((r) => r.plannedHours > 0)
  const periodPhrase = `next ${PRESETS.find((p) => p.n === n)?.label ?? `${n} weeks`}`

  return (
    <section id="capacity" className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
          Capacity · {mode === 'week' ? 'per week' : 'per month'} vs 40h/week
        </h2>
        <div className="flex items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-xs">
          {PRESETS.map((p) => (
            <Link
              key={p.n}
              href={href(p.n)}
              scroll={false}
              className={`px-2.5 py-1 ${n === p.n ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-[#9398A1] border border-dashed border-[#ECECEE] rounded-xl px-4 py-6 text-center">
          Assign owners, estimates and start/due dates to tasks to see capacity here.
        </div>
      ) : (
        <>
          {/* Team headline */}
          <div className="border border-[#ECECEE] rounded-2xl bg-white p-4 mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="text-sm">
                <span className="text-[#9398A1]">Team capacity · </span>
                <span className="text-xl font-bold" style={{ color: pctColour(summary.pct) }}>{Math.round(summary.pct)}%</span>
                <span className="text-[#5A5E66]"> — {fmtHours(summary.totalPlannedHours)}h planned / {fmtHours(summary.totalAvailableHours)}h available</span>
              </div>
              <div className="text-xs text-[#9398A1]">
                {summary.headcount} {summary.headcount === 1 ? 'person' : 'people'} · {periodPhrase}
              </div>
            </div>
            <div className="mt-2"><UtilBar pct={summary.pct} /></div>
          </div>

          {/* Per-person utilisation — everyone, most-loaded first; idle = free. */}
          <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden mb-4">
            {summaryRows.map((r) => (
              <div key={r.ownerId} className="px-4 py-2.5 border-b border-[#F4F4F6] last:border-b-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {r.plannedHours === 0 ? (
                      <span className="text-[#9398A1]">0% · free</span>
                    ) : (
                      <>
                        <span className={`font-semibold ${r.pct >= 100 ? 'text-[#E0572E]' : 'text-[#15171C]'}`}>{Math.round(r.pct)}%</span>
                        <span className="text-[#9398A1]"> · {fmtHours(r.plannedHours)}/{fmtHours(r.availableHours)}h</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-1.5"><UtilBar pct={r.pct} /></div>
              </div>
            ))}
          </div>

          {/* Per-week grid — only members with scheduled load (no empty rows). */}
          {gridRows.length > 0 && (
          <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
                <th className="font-semibold px-4 py-2.5 sticky left-0 bg-white min-w-[140px]">Person</th>
                {columns.map((c) => <th key={c.key} className="font-semibold px-3 py-2.5 whitespace-nowrap min-w-[72px]">{c.label}</th>)}
                <th className="font-semibold px-3 py-2.5 text-right whitespace-nowrap">Not in weeks</th>
              </tr>
            </thead>
            <tbody>
              {gridRows.map((r) => (
                <tr key={r.ownerId} className="border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC]">
                  <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">{r.name}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 align-top">
                      <Cell hours={r.cells[c.key] ?? 0} capacity={c.capacity} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-[12px] text-[#9398A1]">
                    {r.unscheduledHours > 0 && <span title="Estimated but undated">{fmtHours(r.unscheduledHours)}h unscheduled</span>}
                    {r.unscheduledHours > 0 && (r.unestimatedCount > 0 || r.onHoldCount > 0) && <span> · </span>}
                    {r.unestimatedCount > 0 && <span title="Open tasks with no estimate">{r.unestimatedCount} no est.</span>}
                    {r.unestimatedCount > 0 && r.onHoldCount > 0 && <span> · </span>}
                    {r.onHoldCount > 0 && <span title="On-hold tasks (excluded from hours)">{r.onHoldCount} on hold</span>}
                    {r.unscheduledHours === 0 && r.unestimatedCount === 0 && r.onHoldCount === 0 && <span className="text-[#C0C4CC]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </>
      )}
      <p className="text-[11px] text-[#9398A1] mt-2">
        Hours = each task&rsquo;s estimate spread evenly across its start→due weeks. On-hold &amp; complete tasks excluded.
        Includes tasks for archived clients (committed load is still load).
      </p>
    </section>
  )
}

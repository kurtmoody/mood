'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import FilterMenu from '@/components/FilterMenu'
import type { TimeReportModel } from '@/lib/timeReport'
import type { Range, Preset } from '@/lib/reportRange'

const PRESET_LABELS: { p: Preset; label: string }[] = [
  { p: 'day', label: 'Day' },
  { p: 'week', label: 'Week' },
  { p: 'month', label: 'Month' },
  { p: 'quarter', label: 'Quarter' },
  { p: 'year', label: 'Year' },
]

// Mirrors TimesheetSection's fmtDur (hours/minutes). No productivity framing.
function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function pctStr(p: number): string {
  return `${Math.round(p)}%`
}

export default function TimeReport({
  model,
  range,
  clients,
  selectedClientIds,
  people,
  selectedPeopleIds,
  error,
}: {
  model: TimeReportModel
  range: Range
  clients: { id: string; name: string }[]
  selectedClientIds: string[]
  people: { id: string; name: string }[]
  selectedPeopleIds: string[]
  error: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()

  // Switching preset keeps the client/person scope; drop any stale custom from/to.
  const href = (p: Preset) => {
    const sp = new URLSearchParams(params.toString())
    sp.set('range', p)
    sp.delete('from')
    sp.delete('to')
    return `/reports?${sp.toString()}`
  }

  // ?clients= / ?people= live in the URL (mirrors the calendar): clear the param when the
  // selection is empty or all, else set it comma-joined. Other params preserved.
  function setMulti(key: 'clients' | 'people', ids: string[], total: number) {
    const sp = new URLSearchParams(params.toString())
    if (ids.length === 0 || ids.length === total) sp.delete(key)
    else sp.set(key, ids.join(','))
    router.push(`/reports?${sp.toString()}`)
  }
  function toggle(key: 'clients' | 'people', selected: string[], total: number, id: string) {
    const set = new Set(selected)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setMulti(key, [...set], total)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Time</h1>
      <p className="text-sm text-[#9398A1] mt-1 mb-5">Where our hours went — how time was distributed across clients and the team.</p>

      {/* Filters + range */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {clients.length > 1 && (
          <FilterMenu
            label="Clients"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            selected={new Set(selectedClientIds)}
            onToggle={(id) => toggle('clients', selectedClientIds, clients.length, id)}
            onClear={() => setMulti('clients', [], clients.length)}
          />
        )}
        {people.length > 1 && (
          <FilterMenu
            label="People"
            options={people.map((p) => ({ value: p.id, label: p.name }))}
            selected={new Set(selectedPeopleIds)}
            onToggle={(id) => toggle('people', selectedPeopleIds, people.length, id)}
            onClear={() => setMulti('people', [], people.length)}
          />
        )}
        <div className="inline-flex rounded-lg border border-[#E2E2E5] overflow-hidden text-sm">
          {PRESET_LABELS.map(({ p, label }) => (
            <Link key={p} href={href(p)}
              className={`px-3 py-1.5 ${range.preset === p ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'}`}>
              {label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-center gap-1.5">
          <input type="hidden" name="range" value="custom" />
          {selectedClientIds.length > 0 && <input type="hidden" name="clients" value={selectedClientIds.join(',')} />}
          {selectedPeopleIds.length > 0 && <input type="hidden" name="people" value={selectedPeopleIds.join(',')} />}
          <input type="date" name="from" className="border border-[#E2E2E5] rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-[#9398A1] text-sm">–</span>
          <input type="date" name="to" className="border border-[#E2E2E5] rounded-lg px-2 py-1.5 text-sm" />
          <button type="submit" className={`px-3 py-1.5 text-sm rounded-lg border ${range.preset === 'custom' ? 'bg-[#15171C] text-white border-[#15171C] font-semibold' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'}`}>Custom</button>
        </form>
        <span className="text-sm text-[#5A5E66] ml-auto">{range.label}</span>
      </div>

      {error && <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">{error}</div>}

      {model.totalMinutes === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center text-sm text-[#9398A1]">
          No time logged in this range.
        </div>
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat label="Total hours" value={fmtDur(model.totalMinutes)} />
            <Stat label="People logged" value={String(model.peopleCount)} />
            <Stat label="Clients worked" value={String(model.clientCount)} />
            <Stat label="Entries" value={String(model.entryCount)} />
          </div>

          {/* By client first; by person presented as distribution, not a ranking. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Breakdown
              title="By client"
              rows={model.byClient.map((c) => ({ key: c.clientId, name: c.name, minutes: c.minutes, pct: c.pct }))}
            />
            <Breakdown
              title="By person"
              subtitle="How time was distributed across the team"
              rows={model.byPerson.map((p) => ({ key: p.userId, name: p.name, minutes: p.minutes, pct: p.pct }))}
            />
          </div>

          <p className="text-xs text-[#9398A1] mt-5">
            Unattributed (no task): <span className="font-semibold text-[#5A5E66]">{fmtDur(model.unattributedMinutes)}</span>
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#ECECEE] rounded-xl bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">{label}</div>
      <div className="text-lg font-bold mt-0.5 text-[#15171C]">{value}</div>
    </div>
  )
}

type Row = { key: string; name: string; minutes: number; pct: number }
function Breakdown({ title, subtitle, rows }: { title: string; subtitle?: string; rows: Row[] }) {
  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#ECECEE]">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-[11px] text-[#9398A1] mt-0.5">{subtitle}</div>}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[#9398A1]">Nothing here.</div>
      ) : (
        <div className="divide-y divide-[#F4F4F6]">
          {rows.map((r) => (
            <div key={r.key} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-[#5A5E66] tabular-nums">{fmtDur(r.minutes)} · {pctStr(r.pct)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#F4F4F6] overflow-hidden">
                <div className="h-full bg-[#15171C]" style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

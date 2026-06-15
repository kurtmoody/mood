'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import FilterMenu from '@/components/FilterMenu'
import type { ProfitModel, Totals } from '@/lib/profitability'
import type { Range, Preset } from '@/lib/reportRange'

const PRESET_LABELS: { p: Preset; label: string }[] = [
  { p: 'day', label: 'Day' },
  { p: 'week', label: 'Week' },
  { p: 'month', label: 'Month' },
  { p: 'quarter', label: 'Quarter' },
  { p: 'year', label: 'Year' },
]

function money(n: number | null): string {
  if (n == null) return '—'
  return '€' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function marginPctStr(p: number | null): string {
  return p == null ? '—' : `${Math.round(p)}%`
}
const INVOICE_LABEL: Record<string, string> = { not_invoiced: 'Not invoiced', invoiced: 'Invoiced', paid: 'Paid' }

function marginClass(m: number | null): string {
  if (m == null) return 'text-[#9398A1]'
  return m < 0 ? 'text-[#E0572E] font-semibold' : 'text-[#15171C]'
}

export default function ProfitabilityReport({
  model,
  range,
  clients,
  selectedClientIds,
}: {
  model: ProfitModel
  range: Range
  clients: { id: string; name: string }[]
  selectedClientIds: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  // Switching preset keeps the client scope; drop any stale custom from/to.
  const href = (p: Preset) => {
    const sp = new URLSearchParams(params.toString())
    sp.set('range', p)
    sp.delete('from')
    sp.delete('to')
    return `/reports?${sp.toString()}`
  }

  // Client scope lives in ?clients= (mirrors the calendar): clear the param when the
  // selection is empty or all, else set it comma-joined. Other params preserved.
  function setClients(ids: string[]) {
    const sp = new URLSearchParams(params.toString())
    if (ids.length === 0 || ids.length === clients.length) sp.delete('clients')
    else sp.set('clients', ids.join(','))
    router.push(`/reports?${sp.toString()}`)
  }
  function toggleClient(id: string) {
    const set = new Set(selectedClientIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setClients([...set])
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Profitability</h1>
      <p className="text-sm text-[#9398A1] mt-1 mb-5">Per-job value, time-cost and margin. Admin-only.</p>

      {/* Client + range controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {clients.length > 1 && (
          <FilterMenu
            label="Clients"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            selected={new Set(selectedClientIds)}
            onToggle={toggleClient}
            onClear={() => setClients([])}
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
          <input type="date" name="from" className="border border-[#E2E2E5] rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-[#9398A1] text-sm">–</span>
          <input type="date" name="to" className="border border-[#E2E2E5] rounded-lg px-2 py-1.5 text-sm" />
          <button type="submit" className={`px-3 py-1.5 text-sm rounded-lg border ${range.preset === 'custom' ? 'bg-[#15171C] text-white border-[#15171C] font-semibold' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'}`}>Custom</button>
        </form>
        <span className="text-sm text-[#5A5E66] ml-auto">
          {selectedClientIds.length > 0 ? `${selectedClientIds.length} of ${clients.length} clients` : 'All clients'} · {range.label}
        </span>
      </div>

      {!model.rateSet && (
        <div className="mb-4 rounded-lg border border-[#E8920C]/30 bg-[#E8920C]/5 px-4 py-2.5 text-sm text-[#8A6D1F]">
          No cost rate set — costs and margins can&rsquo;t be calculated. Set one in <Link href="/admin/costs" className="underline">Admin → Cost per hour</Link>.
        </div>
      )}

      <p className="text-xs text-[#9398A1] mb-4">
        Value is the full agreed price; cost reflects only time logged in the selected range. Margins are accurate for fully-logged jobs — a narrow range shows only part of an in-progress job&rsquo;s cost.
      </p>

      {/* Grand total */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Total value" value={money(model.grand.value)} />
        <Stat label="Total cost" value={money(model.grand.cost)} />
        <Stat label="Total margin" value={money(model.grand.margin)} accent={model.grand.margin != null && model.grand.margin < 0} />
        <Stat label="Margin %" value={marginPctStr(model.grand.marginPct)} />
        <Stat label="To invoice" value={money(model.grandOutstanding)} />
      </div>

      {model.groups.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center text-sm text-[#9398A1]">
          No jobs with a value or time logged in this range.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
                <th className="font-semibold px-4 py-2.5">Job</th>
                <th className="font-semibold px-3 py-2.5 text-right">Value</th>
                <th className="font-semibold px-3 py-2.5 text-right">Cost</th>
                <th className="font-semibold px-3 py-2.5 text-right">Margin</th>
                <th className="font-semibold px-3 py-2.5 text-right">Margin %</th>
                <th className="font-semibold px-3 py-2.5">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {model.groups.map((g) => (
                <GroupBlock key={g.clientId} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-[#ECECEE] rounded-xl bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${accent ? 'text-[#E0572E]' : 'text-[#15171C]'}`}>{value}</div>
    </div>
  )
}

function GroupBlock({ g }: { g: ProfitModel['groups'][number] }) {
  return (
    <>
      <tr className="bg-[#FBFBFC] border-b border-[#ECECEE]">
        <td className="px-4 py-1.5 font-semibold" colSpan={5}>{g.name}</td>
        <td className="px-3 py-1.5 text-[11px] text-[#9398A1] whitespace-nowrap">{money(g.outstanding)} to invoice</td>
      </tr>
      {g.jobs.map((j) => (
        <tr key={j.taskId} className="border-b border-[#ECECEE] hover:bg-[#FBFBFC]">
          <td className="px-4 py-2"><Link href="/tasks" className="hover:underline">{j.title}</Link></td>
          <td className="px-3 py-2 text-right whitespace-nowrap">{money(j.value)}</td>
          <td className="px-3 py-2 text-right whitespace-nowrap text-[#5A5E66]">{money(j.cost)}</td>
          <td className={`px-3 py-2 text-right whitespace-nowrap ${marginClass(j.margin)}`}>{money(j.margin)}</td>
          <td className="px-3 py-2 text-right whitespace-nowrap text-[#5A5E66]">{marginPctStr(j.marginPct)}</td>
          <td className="px-3 py-2 text-[#5A5E66] whitespace-nowrap">{INVOICE_LABEL[j.invoiceStatus] ?? j.invoiceStatus}</td>
        </tr>
      ))}
      {g.unattributedMinutes > 0 && (
        <tr className="border-b border-[#ECECEE] text-[#9398A1] italic">
          <td className="px-4 py-2">Unattributed time ({Math.round((g.unattributedMinutes / 60) * 10) / 10}h)</td>
          <td className="px-3 py-2 text-right">—</td>
          <td className="px-3 py-2 text-right">{money(g.unattributedCost)}</td>
          <td className="px-3 py-2 text-right">—</td>
          <td className="px-3 py-2 text-right">—</td>
          <td className="px-3 py-2"></td>
        </tr>
      )}
      <SubtotalRow t={g.subtotal} />
    </>
  )
}

function SubtotalRow({ t }: { t: Totals }) {
  return (
    <tr className="border-b-2 border-[#ECECEE] font-medium">
      <td className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-[#9398A1]">Subtotal</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{money(t.value)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-[#5A5E66]">{money(t.cost)}</td>
      <td className={`px-3 py-2 text-right whitespace-nowrap ${marginClass(t.margin)}`}>{money(t.margin)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-[#5A5E66]">{marginPctStr(t.marginPct)}</td>
      <td className="px-3 py-2"></td>
    </tr>
  )
}

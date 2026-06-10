// Profitability — pure computation (no DB). value (full, NOT date-split) − time-cost
// (only time logged in the selected range), grouped by client. Admin-only data; the page
// gates before any of this runs.

export type RepTask = { id: string; title: string | null; value: number | null; invoice_status: string; client_id: string }
export type RepEntry = { task_id: string | null; client_id: string; duration_minutes: number | null }
export type RepClient = { id: string; name: string }

export type JobRow = {
  taskId: string
  title: string
  value: number | null
  cost: number | null      // null when no cost rate is set
  margin: number | null
  marginPct: number | null // null when value is 0/unset or no rate
  invoiceStatus: string
}
export type Totals = { value: number; cost: number | null; margin: number | null; marginPct: number | null }
export type ClientGroup = {
  clientId: string
  name: string
  jobs: JobRow[]
  unattributedCost: number | null // in-range client-direct time (task_id null); null if none / no rate
  unattributedMinutes: number
  outstanding: number             // sum of not-invoiced job values
  subtotal: Totals
}
export type ProfitModel = { rateSet: boolean; groups: ClientGroup[]; grand: Totals; grandOutstanding: number }

function pct(margin: number | null, value: number): number | null {
  if (margin == null || value <= 0) return null
  return (margin / value) * 100
}

export function computeProfitability(
  tasks: RepTask[], entries: RepEntry[], clients: RepClient[], costPerHour: number | null,
): ProfitModel {
  const rateSet = costPerHour != null
  const costOf = (minutes: number): number | null => (rateSet ? (minutes / 60) * (costPerHour as number) : null)

  // In-range minutes per task, and unattributed (task_id null) minutes per client.
  const minByTask = new Map<string, number>()
  const unattribMinByClient = new Map<string, number>()
  for (const e of entries) {
    const m = e.duration_minutes ?? 0
    if (m <= 0) continue
    if (e.task_id) minByTask.set(e.task_id, (minByTask.get(e.task_id) ?? 0) + m)
    else unattribMinByClient.set(e.client_id, (unattribMinByClient.get(e.client_id) ?? 0) + m)
  }

  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  const groups = new Map<string, ClientGroup>()
  const getGroup = (clientId: string): ClientGroup => {
    let g = groups.get(clientId)
    if (!g) {
      g = { clientId, name: nameById.get(clientId) ?? 'Unknown client', jobs: [], unattributedCost: null, unattributedMinutes: 0, outstanding: 0,
            subtotal: { value: 0, cost: rateSet ? 0 : null, margin: rateSet ? 0 : null, marginPct: null } }
      groups.set(clientId, g)
    }
    return g
  }

  // Jobs.
  for (const t of tasks) {
    const g = getGroup(t.client_id)
    const cost = costOf(minByTask.get(t.id) ?? 0)
    const value = t.value
    const margin = cost == null ? null : (value ?? 0) - cost
    g.jobs.push({
      taskId: t.id, title: t.title || 'Untitled', value, cost, margin,
      marginPct: pct(margin, value ?? 0), invoiceStatus: t.invoice_status,
    })
    if (t.invoice_status === 'not_invoiced' && value) g.outstanding += value
  }

  // Unattributed client-direct time (ensures clients with only such time still appear).
  for (const [clientId, minutes] of unattribMinByClient) {
    const g = getGroup(clientId)
    g.unattributedMinutes = minutes
    g.unattributedCost = costOf(minutes)
  }

  // Subtotals (cost includes unattributed; totals reconcile).
  for (const g of groups.values()) {
    const value = g.jobs.reduce((s, j) => s + (j.value ?? 0), 0)
    let cost: number | null = null
    if (rateSet) {
      cost = g.jobs.reduce((s, j) => s + (j.cost ?? 0), 0) + (g.unattributedCost ?? 0)
    }
    const margin = cost == null ? null : value - cost
    g.subtotal = { value, cost, margin, marginPct: pct(margin, value) }
  }

  const out = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const g of out) g.jobs.sort((a, b) => a.title.localeCompare(b.title))

  const grandValue = out.reduce((s, g) => s + g.subtotal.value, 0)
  const grandCost = rateSet ? out.reduce((s, g) => s + (g.subtotal.cost ?? 0), 0) : null
  const grandMargin = grandCost == null ? null : grandValue - grandCost
  const grandOutstanding = out.reduce((s, g) => s + g.outstanding, 0)

  return {
    rateSet,
    groups: out,
    grand: { value: grandValue, cost: grandCost, margin: grandMargin, marginPct: pct(grandMargin, grandValue) },
    grandOutstanding,
  }
}

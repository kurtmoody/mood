// Capacity planning — pure computation over task fields (no DB, no side effects).
// Spreads each qualifying task's estimated_hours evenly across the Monday-based
// Europe/Malta weeks it spans, then sums per owner per week (or per month at range).

import { mondayOf, addDays, monthOf, monthLabel } from './week'

export type CapTask = {
  owner_id: string | null
  owner_name: string | null
  status: string
  estimated_hours: number | null
  start_date: string | null
  due_date: string | null
}

export type CapColumn = { key: string; label: string; capacity: number }

export type CapRow = {
  ownerId: string
  name: string
  cells: Record<string, number> // colKey → allocated hours
  unscheduledHours: number      // estimated but no dates
  unestimatedCount: number      // open (non-hold) with no estimate
  onHoldCount: number           // on-hold tasks (excluded from hours)
}

export type CapModel = { columns: CapColumn[]; rows: CapRow[] }

const WEEK_BASELINE = 40

// Inclusive list of Monday keys from m1's week to m2's week (m1, m2 are 'YYYY-MM-DD').
function weeksInclusive(m1: string, m2: string): string[] {
  let a = mondayOf(m1)
  const b = mondayOf(m2)
  if (a > b) return [b] // defensive (RPC enforces start <= due)
  const out: string[] = []
  while (a <= b) { out.push(a); a = addDays(a, 7) }
  return out
}

function weekLabel(monday: string): string {
  return new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// weekMondays: the visible range (ordered Monday keys). mode: 'week' or 'month'.
export function computeCapacity(tasks: CapTask[], weekMondays: string[], mode: 'week' | 'month'): CapModel {
  const rows = new Map<string, CapRow>()
  const getRow = (id: string, name: string | null): CapRow => {
    let r = rows.get(id)
    if (!r) { r = { ownerId: id, name: name ?? 'Unknown', cells: {}, unscheduledHours: 0, unestimatedCount: 0, onHoldCount: 0 }; rows.set(id, r) }
    return r
  }

  // 1) Allocate each task's hours to weeks (unbounded), and tally honesty buckets.
  for (const t of tasks) {
    if (!t.owner_id) continue
    if (t.status === 'Complete') continue
    const r = getRow(t.owner_id, t.owner_name)
    if (t.status === 'On Hold') { r.onHoldCount++; continue }
    if (t.estimated_hours == null) { r.unestimatedCount++; continue }
    const est = Number(t.estimated_hours)

    let span: string[]
    if (t.start_date && t.due_date) span = weeksInclusive(t.start_date, t.due_date)
    else if (t.due_date) span = [mondayOf(t.due_date)]
    else if (t.start_date) span = [mondayOf(t.start_date)]
    else { r.unscheduledHours += est; continue } // estimated but undated

    const slice = span.length > 0 ? est / span.length : 0
    for (const w of span) r.cells[w] = (r.cells[w] ?? 0) + slice
  }

  // 2) Project the per-week allocation onto the visible columns.
  let columns: CapColumn[]
  if (mode === 'week') {
    columns = weekMondays.map((m) => ({ key: m, label: weekLabel(m), capacity: WEEK_BASELINE }))
  } else {
    const order: string[] = []
    const weeksPerMonth = new Map<string, number>()
    for (const m of weekMondays) {
      const mo = monthOf(m)
      if (!weeksPerMonth.has(mo)) order.push(mo)
      weeksPerMonth.set(mo, (weeksPerMonth.get(mo) ?? 0) + 1)
    }
    columns = order.map((mo) => ({ key: mo, label: monthLabel(mo), capacity: WEEK_BASELINE * (weeksPerMonth.get(mo) ?? 0) }))
  }

  const out: CapRow[] = []
  for (const r of rows.values()) {
    // Only owners with something to show (load in range, or an honesty bucket).
    const cells: Record<string, number> = {}
    if (mode === 'week') {
      for (const m of weekMondays) if (r.cells[m]) cells[m] = r.cells[m]
    } else {
      for (const col of columns) {
        let sum = 0
        for (const m of weekMondays) if (monthOf(m) === col.key) sum += r.cells[m] ?? 0
        if (sum) cells[col.key] = sum
      }
    }
    out.push({ ...r, cells })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return { columns, rows: out }
}

// The visible range: n Monday keys from the current Malta week forward.
export function rangeWeeks(todayStr: string, n: number): string[] {
  const start = mondayOf(todayStr)
  return Array.from({ length: n }, (_, i) => addDays(start, i * 7))
}

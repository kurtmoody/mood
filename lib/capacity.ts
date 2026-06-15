// Capacity planning — pure computation over task fields (no DB, no side effects).
// Spreads each qualifying task's estimated_hours evenly across the Monday-based
// Europe/Malta weeks it spans, then sums per owner per week (or per month at range).

import { mondayOf, addDays, monthOf, monthLabel } from './week'

export type CapTask = {
  owner_id: string | null
  status: string
  estimated_hours: number | null
  start_date: string | null
  due_date: string | null
}

export type CapColumn = { key: string; label: string; capacity: number }

export type CapRoster = { id: string; name: string } // active team member (id = team_member.id)

export type CapRow = {
  ownerId: string
  name: string
  cells: Record<string, number> // colKey → allocated hours
  plannedHours: number          // Σ of this row's in-period cells (scheduled hours)
  availableHours: number        // Σ of all column capacities (same for everyone)
  pct: number                   // plannedHours / availableHours, as a 0–100 percentage
  unscheduledHours: number      // estimated but no dates (NOT in pct — not planned into the period)
  unestimatedCount: number      // open (non-hold) with no estimate
  onHoldCount: number           // on-hold tasks (excluded from hours)
}

export type CapSummary = {
  totalPlannedHours: number
  totalAvailableHours: number   // availableHours × headcount
  pct: number                   // 0–100 team utilisation
  headcount: number
}

export type CapModel = { columns: CapColumn[]; rows: CapRow[]; summary: CapSummary }

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
// roster: the active team — EVERY member gets a row (idle members at 0% = spare capacity).
export function computeCapacity(tasks: CapTask[], weekMondays: string[], mode: 'week' | 'month', roster: CapRoster[]): CapModel {
  // 1) Allocate each task's hours to weeks (unbounded), and tally honesty buckets, keyed by
  //    owner_id (= team_member.id). Names come from the roster, not the task embed.
  type Alloc = { weekly: Record<string, number>; unscheduledHours: number; unestimatedCount: number; onHoldCount: number }
  const alloc = new Map<string, Alloc>()
  const getAlloc = (id: string): Alloc => {
    let a = alloc.get(id)
    if (!a) { a = { weekly: {}, unscheduledHours: 0, unestimatedCount: 0, onHoldCount: 0 }; alloc.set(id, a) }
    return a
  }

  for (const t of tasks) {
    if (!t.owner_id) continue
    if (t.status === 'Complete') continue
    const a = getAlloc(t.owner_id)
    if (t.status === 'On Hold') { a.onHoldCount++; continue }
    if (t.estimated_hours == null) { a.unestimatedCount++; continue }
    const est = Number(t.estimated_hours)

    let span: string[]
    if (t.start_date && t.due_date) span = weeksInclusive(t.start_date, t.due_date)
    else if (t.due_date) span = [mondayOf(t.due_date)]
    else if (t.start_date) span = [mondayOf(t.start_date)]
    else { a.unscheduledHours += est; continue } // estimated but undated

    const slice = span.length > 0 ? est / span.length : 0
    for (const w of span) a.weekly[w] = (a.weekly[w] ?? 0) + slice
  }

  // 2) Columns + availableHours (Σ of all column capacities — same for everyone).
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
  const availableHours = columns.reduce((s, c) => s + c.capacity, 0)

  // 3) One row per ACTIVE roster member — idle members included at 0% (spare capacity).
  const rows: CapRow[] = roster.map(({ id, name }) => {
    const a = alloc.get(id)
    const cells: Record<string, number> = {}
    if (a) {
      if (mode === 'week') {
        for (const m of weekMondays) if (a.weekly[m]) cells[m] = a.weekly[m]
      } else {
        for (const col of columns) {
          let sum = 0
          for (const m of weekMondays) if (monthOf(m) === col.key) sum += a.weekly[m] ?? 0
          if (sum) cells[col.key] = sum
        }
      }
    }
    const plannedHours = Object.values(cells).reduce((s, h) => s + h, 0)
    return {
      ownerId: id,
      name,
      cells,
      plannedHours,
      availableHours,
      pct: availableHours > 0 ? (plannedHours / availableHours) * 100 : 0,
      unscheduledHours: a?.unscheduledHours ?? 0,
      unestimatedCount: a?.unestimatedCount ?? 0,
      onHoldCount: a?.onHoldCount ?? 0,
    }
  })
  rows.sort((a, b) => a.name.localeCompare(b.name))

  const totalPlannedHours = rows.reduce((s, r) => s + r.plannedHours, 0)
  const totalAvailableHours = availableHours * roster.length
  const summary: CapSummary = {
    totalPlannedHours,
    totalAvailableHours,
    pct: totalAvailableHours > 0 ? (totalPlannedHours / totalAvailableHours) * 100 : 0,
    headcount: roster.length,
  }

  return { columns, rows, summary }
}

// The visible range: n Monday keys from the current Malta week forward.
export function rangeWeeks(todayStr: string, n: number): string[] {
  const start = mondayOf(todayStr)
  return Array.from({ length: n }, (_, i) => addDays(start, i * 7))
}

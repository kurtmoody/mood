// Campaign timeline (Gantt) — pure computation over task/post/campaign dates (no DB, no
// side effects). Monday-based Europe/Malta weeks. Mirrors lib/capacity.ts's approach: the
// same due-only / start-only single-week convention, and an honesty bucket so undated work
// is never silently dropped — it surfaces in `unscheduled` instead of vanishing.

import { mondayOf, addDays } from './week'

// Beyond this the axis would be unreadable; we clamp and flag `truncated`.
const MAX_WEEKS = 26

export type TLTask = {
  id: string
  title: string
  status: string
  ownerName: string | null
  start_date: string | null
  due_date: string | null
}
// scheduledDate is a Malta 'YYYY-MM-DD' bucket (the caller derives it from scheduled_at via
// maltaDate, keeping this module timezone-free like the capacity planner).
export type TLPost = { id: string; title: string; status: string; scheduledDate: string | null }

export type TLWeek = { key: string; label: string }
export type TLBar = { id: string; title: string; ownerName: string | null; status: string; startIndex: number; span: number }
export type TLDot = { id: string; title: string; status: string; index: number; posted: boolean }
export type TLUnscheduled = { id: string; title: string; ownerName: string | null; status: string }
export type TLBand = { startIndex: number; endIndex: number }

export type TimelineModel = {
  weeks: TLWeek[]            // empty when there is no dated anchor to build an axis from
  bars: TLBar[]
  dots: TLDot[]
  unscheduled: TLUnscheduled[]
  band: TLBand | null       // the campaign flight window, only when both dates are set
  truncated: boolean        // the natural span exceeded MAX_WEEKS and was clamped
}

// Whole weeks from Monday a to Monday b (b − a) / 7, exact (noon-UTC anchored).
function weekDiff(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()
  return Math.round(ms / (7 * 86_400_000))
}

function weekLabel(monday: string): string {
  return new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function computeTimeline(
  campaign: { start_date: string | null; end_date: string | null },
  tasks: TLTask[],
  posts: TLPost[],
): TimelineModel {
  // Honesty bucket first — a task with no dates never disappears (the capacity-planner rule).
  const unscheduled: TLUnscheduled[] = tasks
    .filter((t) => !t.start_date && !t.due_date)
    .map((t) => ({ id: t.id, title: t.title, ownerName: t.ownerName, status: t.status }))

  // Collect every Monday anchor: campaign window + task dates + post weeks.
  const anchors: string[] = []
  const push = (d: string | null) => { if (d) anchors.push(mondayOf(d)) }
  push(campaign.start_date); push(campaign.end_date)
  for (const t of tasks) { push(t.start_date); push(t.due_date) }
  for (const p of posts) push(p.scheduledDate)

  // No dated anchor → no axis. Still hand back the unscheduled list.
  if (anchors.length === 0) {
    return { weeks: [], bars: [], dots: [], unscheduled, band: null, truncated: false }
  }

  const earliest = anchors.reduce((a, b) => (a < b ? a : b))
  const latest = anchors.reduce((a, b) => (a > b ? a : b))
  const fullSpan = weekDiff(earliest, latest) + 1
  const truncated = fullSpan > MAX_WEEKS
  const count = Math.min(fullSpan, MAX_WEEKS)

  const weeks: TLWeek[] = Array.from({ length: count }, (_, i) => {
    const key = addDays(earliest, i * 7)
    return { key, label: weekLabel(key) }
  })
  const lastIdx = weeks.length - 1
  // Column index of a date's Monday, clamped into the visible (possibly truncated) window.
  const idx = (d: string) => clamp(weekDiff(earliest, mondayOf(d)), 0, lastIdx)

  // Bars — dated tasks. Same convention as the capacity planner: both → span; one → single week.
  const bars: TLBar[] = []
  for (const t of tasks) {
    const base = { id: t.id, title: t.title, ownerName: t.ownerName, status: t.status }
    if (t.start_date && t.due_date) {
      const s = idx(t.start_date), e = idx(t.due_date)
      bars.push({ ...base, startIndex: Math.min(s, e), span: Math.abs(e - s) + 1 })
    } else if (t.due_date) {
      bars.push({ ...base, startIndex: idx(t.due_date), span: 1 })
    } else if (t.start_date) {
      bars.push({ ...base, startIndex: idx(t.start_date), span: 1 })
    }
    // neither → already in `unscheduled`
  }
  bars.sort((a, b) => a.startIndex - b.startIndex || a.title.localeCompare(b.title))

  // Dots — scheduled posts, one per post (solid when posted).
  const dots: TLDot[] = posts
    .filter((p): p is TLPost & { scheduledDate: string } => !!p.scheduledDate)
    .map((p) => ({ id: p.id, title: p.title, status: p.status, index: idx(p.scheduledDate), posted: p.status === 'posted' }))
    .sort((a, b) => a.index - b.index)

  // The flight window — only when the campaign has both dates.
  const band: TLBand | null =
    campaign.start_date && campaign.end_date
      ? { startIndex: idx(campaign.start_date), endIndex: idx(campaign.end_date) }
      : null

  return { weeks, bars, dots, unscheduled, band, truncated }
}

// Complete ÷ total — nothing excluded (On Hold is still work). For the progress rollups.
export function taskCounts(statuses: string[]): { complete: number; total: number } {
  return { complete: statuses.filter((s) => s === 'Complete').length, total: statuses.length }
}

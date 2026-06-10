// Report date-range presets → a [startDate, endDate) pair of Malta date strings (endDate
// exclusive), reusing lib/week. The range filters the cost side (time entries) only.

import { todayMalta, mondayOf, addDays, monthOf, firstOfMonth, addMonths, monthLabel, weekRangeLabel, isDateStr } from './week'

export type Preset = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
export const PRESETS: Preset[] = ['day', 'week', 'month', 'quarter', 'year', 'custom']

export type Range = { preset: Preset; startDate: string; endDate: string; label: string }

function dayLabel(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function quarterStartMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const qStart = Math.floor((m - 1) / 3) * 3 + 1
  return `${y}-${String(qStart).padStart(2, '0')}`
}
function quarterLabel(qMonth: string): string {
  const [y, m] = qMonth.split('-').map(Number)
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
}

export function resolveRange(preset: Preset, from?: string, to?: string): Range {
  const today = todayMalta()
  switch (preset) {
    case 'day':
      return { preset, startDate: today, endDate: addDays(today, 1), label: dayLabel(today) }
    case 'week': {
      const mon = mondayOf(today)
      return { preset, startDate: mon, endDate: addDays(mon, 7), label: weekRangeLabel(mon) }
    }
    case 'quarter': {
      const qm = quarterStartMonth(monthOf(today))
      return { preset, startDate: firstOfMonth(qm), endDate: firstOfMonth(addMonths(qm, 3)), label: quarterLabel(qm) }
    }
    case 'year': {
      const y = today.slice(0, 4)
      return { preset, startDate: `${y}-01-01`, endDate: `${Number(y) + 1}-01-01`, label: y }
    }
    case 'custom':
      if (isDateStr(from) && isDateStr(to) && from <= to) {
        return { preset, startDate: from, endDate: addDays(to, 1), label: `${dayLabel(from)} – ${dayLabel(to)}` }
      }
      // fall through to month when custom dates are missing/invalid
    // eslint-disable-next-line no-fallthrough
    case 'month':
    default: {
      const mo = monthOf(today)
      return { preset: preset === 'custom' ? 'custom' : 'month', startDate: firstOfMonth(mo), endDate: firstOfMonth(addMonths(mo, 1)), label: monthLabel(mo) }
    }
  }
}

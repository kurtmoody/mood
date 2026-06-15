// Week/date helpers for the calendar. Week starts Monday, Europe/Malta.
// Pure functions, shared by server (page query) and client (calendar UI).

const TZ = 'Europe/Malta'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// 'YYYY-MM-DD' for an instant, in Malta time — the bucket key for a post.
export function maltaDate(instant: string | Date): string {
  return dateFmt.format(new Date(instant))
}

// Today's date in Malta, 'YYYY-MM-DD'.
export function todayMalta(): string {
  return dateFmt.format(new Date())
}

// Calendar-date arithmetic — tz-independent, anchored at noon UTC to dodge DST edges.
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// 0 = Mon … 6 = Sun for a calendar date.
function weekdayMon(dateStr: string): number {
  return (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7
}

// Monday ('YYYY-MM-DD') of the week containing dateStr.
export function mondayOf(dateStr: string): string {
  return addDays(dateStr, -weekdayMon(dateStr))
}

// The 7 dates Mon…Sun for a given Monday.
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

// UTC instant for a Malta wall-clock date+time (e.g. '2026-07-01', '09:30:00').
// Finds Malta's offset at that instant via the standard guess-and-correct trick, so it
// is DST-correct. timeStr defaults to midnight.
export function zonedDateTimeToUTC(dateStr: string, timeStr = '00:00:00'): Date {
  const guess = new Date(`${dateStr}T${timeStr}Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(guess).reduce<Record<string, string>>((a, p) => {
    a[p.type] = p.value
    return a
  }, {})
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  const offset = asUTC - guess.getTime()
  return new Date(guess.getTime() - offset)
}

// UTC instant for the start of a Malta day — for range queries on timestamptz.
export function zonedDayStartUTC(dateStr: string): Date {
  return zonedDateTimeToUTC(dateStr, '00:00:00')
}

// UTC ISO string for a datetime-local value ('YYYY-MM-DDTHH:mm'), read as Malta
// wall-clock. THE conversion for datetime-local inputs — never naive new Date(value),
// which would read the input in the browser's timezone instead of Malta's.
export function maltaInputToISO(value: string): string {
  const [datePart, timePart] = value.split('T')
  const time = timePart?.length === 5 ? `${timePart}:00` : (timePart ?? '00:00:00')
  return zonedDateTimeToUTC(datePart, time).toISOString()
}

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

// 'HH:mm:ss' wall-clock time of an instant, in Malta.
export function maltaTimeOfDay(instant: string | Date): string {
  return timeFmt.format(new Date(instant))
}

// Move an instant to a different Malta calendar day while KEEPING its Malta-local
// time-of-day; returns the new UTC instant. (Date-only shift — never shift in UTC.)
export function rescheduleToDateMalta(instant: string | Date, targetDateStr: string): Date {
  return zonedDateTimeToUTC(targetDateStr, maltaTimeOfDay(instant))
}

// Validate a 'YYYY-MM-DD' string.
export function isDateStr(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// ----- Month helpers -----

// 'YYYY-MM' of a date.
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

// First day of a month, 'YYYY-MM-DD'.
export function firstOfMonth(month: string): string {
  return `${month}-01`
}

// Shift a month by n, 'YYYY-MM'.
export function addMonths(month: string, n: number): string {
  const d = new Date(`${month}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Validate a 'YYYY-MM' string.
export function isMonthStr(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s)
}

// "June 2026".
export function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Full month grid (Mon-aligned): Monday on/before the 1st → Sunday on/after the last day.
export function monthGridDates(month: string): string[] {
  const start = mondayOf(firstOfMonth(month))
  const lastDay = addDays(firstOfMonth(addMonths(month, 1)), -1)
  const end = addDays(mondayOf(lastDay), 6)
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

// "9–15 June 2026", handling cross-month / cross-year weeks.
export function weekRangeLabel(monday: string): string {
  const start = new Date(`${monday}T12:00:00Z`)
  const end = new Date(`${addDays(monday, 6)}T12:00:00Z`)
  const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  const sd = start.getUTCDate()
  const ed = end.getUTCDate()
  const sm = monthName(start)
  const em = monthName(end)
  const sy = start.getUTCFullYear()
  const ey = end.getUTCFullYear()
  if (sy !== ey) return `${sd} ${sm} ${sy} – ${ed} ${em} ${ey}`
  if (sm !== em) return `${sd} ${sm} – ${ed} ${em} ${ey}`
  return `${sd}–${ed} ${sm} ${ey}`
}

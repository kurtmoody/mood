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

// UTC instant for the start of a Malta day — for range queries on timestamptz.
export function zonedDayStartUTC(dateStr: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`)
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

// Validate a 'YYYY-MM-DD' string.
export function isDateStr(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
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

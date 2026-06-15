// Time report — pure computation (no DB, no money). Aggregates completed time_entry rows
// into a team total plus by-client and by-person distributions. NON-FINANCIAL by design:
// callers pass only duration/user/client/task fields — this module never sees value or cost.
// Mirrors lib/profitability.ts in shape; framed as workload distribution, not performance.

export type TimeEntryRow = {
  user_id: string
  client_id: string
  task_id: string | null
  duration_minutes: number | null
}

export type PersonSlice = { userId: string; name: string; minutes: number; pct: number }
export type ClientSlice = { clientId: string; name: string; minutes: number; pct: number }

export type TimeReportModel = {
  totalMinutes: number
  peopleCount: number
  clientCount: number
  entryCount: number
  unattributedMinutes: number     // time with no task (task_id null); still belongs to a client
  byPerson: PersonSlice[]         // sorted desc by minutes
  byClient: ClientSlice[]         // sorted desc by minutes
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

export function computeTimeReport(
  entries: TimeEntryRow[],
  nameMap: Map<string, string>,
  clientMap: Map<string, string>,
): TimeReportModel {
  const byUser = new Map<string, number>()
  const byClient = new Map<string, number>()
  let totalMinutes = 0
  let unattributedMinutes = 0

  for (const e of entries) {
    const m = e.duration_minutes ?? 0
    if (m <= 0) continue
    totalMinutes += m
    byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + m)
    byClient.set(e.client_id, (byClient.get(e.client_id) ?? 0) + m)
    if (e.task_id == null) unattributedMinutes += m
  }

  const byPerson: PersonSlice[] = [...byUser.entries()]
    .map(([userId, minutes]) => ({ userId, name: nameMap.get(userId) ?? 'Unknown', minutes, pct: pct(minutes, totalMinutes) }))
    .sort((a, b) => b.minutes - a.minutes)

  const byClientArr: ClientSlice[] = [...byClient.entries()]
    .map(([clientId, minutes]) => ({ clientId, name: clientMap.get(clientId) ?? 'Unknown client', minutes, pct: pct(minutes, totalMinutes) }))
    .sort((a, b) => b.minutes - a.minutes)

  return {
    totalMinutes,
    peopleCount: byPerson.length,
    clientCount: byClientArr.length,
    entryCount: entries.length,
    unattributedMinutes,
    byPerson,
    byClient: byClientArr,
  }
}

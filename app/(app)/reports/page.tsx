import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { zonedDayStartUTC, todayMalta } from '@/lib/week'
import { resolveRange, PRESETS, type Preset } from '@/lib/reportRange'
import { computeProfitability, type RepTask, type RepEntry, type RepClient } from '@/lib/profitability'
import { computeTimeReport, type TimeEntryRow } from '@/lib/timeReport'
import { computeCapacity, rangeWeeks } from '@/lib/capacity'
import ProfitabilityReport from '@/components/ProfitabilityReport'
import TimeReport from '@/components/TimeReport'
import CapacityPlanner from '@/components/CapacityPlanner'
import ReportTabs, { type ReportTab } from '@/components/ReportTabs'
import PageContainer from '@/components/PageContainer'

// /reports is open to ALL agency members and shows ONE report at a time (the ?report tab).
// Time + Capacity are NON-FINANCIAL (member-visible); Profitability is ADMIN-ONLY — a non-admin
// can never select it, and only the active tab's data is fetched.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ report?: string; range?: string; from?: string; to?: string; clients?: string; people?: string; cap?: string }> }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // agency members only (clients / non-members out)

  const sp = await searchParams

  // Active tab. SECURITY: a non-admin's ?report can never resolve to 'profitability' — coerce it
  // to 'time' so the financial branch (fetch + render) below is unreachable for them.
  let report: ReportTab = sp.report === 'capacity' || sp.report === 'profitability' ? sp.report : 'time'
  if (report === 'profitability' && !access.isAgencyAdmin) report = 'time'

  // Shared param parsing (no DB) — each report uses the subset it needs.
  const preset: Preset = PRESETS.includes((sp.range ?? '') as Preset) ? (sp.range as Preset) : 'month'
  const range = resolveRange(preset, sp.from, sp.to)
  const startUTC = zonedDayStartUTC(range.startDate).toISOString()
  const endUTC = zonedDayStartUTC(range.endDate).toISOString()
  const selectedClientIds = (sp.clients ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const selectedPeopleIds = (sp.people ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const hasClientFilter = selectedClientIds.length > 0
  const CAP_PRESETS = [5, 8, 13, 26, 52]
  const capWeeks = CAP_PRESETS.includes(Number(sp.cap)) ? Number(sp.cap) : 5
  const capMode: 'week' | 'month' = capWeeks <= 8 ? 'week' : 'month'

  // Only the active tab's data is fetched + rendered.
  let content: ReactNode = null

  if (report === 'time') {
    // ── Member-level TIME (NON-FINANCIAL) ──
    // SECURITY BOUNDARY: selects ONLY user_id, client_id, task_id, duration_minutes, started_at —
    // NO value/cost/margin. time_entry RLS (is_agency_member) makes team-wide hours member-visible.
    let teQ = supabase
      .from('time_entry')
      .select('user_id, client_id, task_id, duration_minutes, started_at')
      .gte('started_at', startUTC)
      .lt('started_at', endUTC)
      .not('ended_at', 'is', null)
    if (hasClientFilter) teQ = teQ.in('client_id', selectedClientIds)
    if (selectedPeopleIds.length) teQ = teQ.in('user_id', selectedPeopleIds)
    const { data: timeEntries, error: teErr } = await teQ
    if (teErr) console.error('reports: time_entry (time report)', teErr)

    const { data: members, error: memErr } = await supabase.from('team_member').select('user_id, full_name')
    if (memErr) console.error('reports: team_member', memErr)
    const { data: allClients, error: clErr } = await supabase.from('client').select('id, name')
    if (clErr) console.error('reports: client', clErr)

    const nameMap = new Map<string, string>()
    for (const m of members ?? []) if (m.user_id) nameMap.set(m.user_id as string, (m.full_name as string) ?? 'Unknown')
    const clientMap = new Map<string, string>((allClients ?? []).map((c) => [c.id as string, c.name as string]))
    const timeModel = computeTimeReport((timeEntries ?? []) as TimeEntryRow[], nameMap, clientMap)

    const clientOptions = (allClients ?? []) as { id: string; name: string }[]
    // Person filter options = team members linked to an auth user (deduped by user_id).
    const peopleOptions = [...new Map(
      (members ?? [])
        .filter((m) => m.user_id)
        .map((m) => [m.user_id as string, { id: m.user_id as string, name: (m.full_name as string) ?? 'Unknown' }]),
    ).values()]
    const timeError = teErr ? `Could not load time data — ${teErr.message}` : null

    content = (
      <TimeReport
        model={timeModel}
        range={range}
        clients={clientOptions}
        selectedClientIds={selectedClientIds}
        people={peopleOptions}
        selectedPeopleIds={selectedPeopleIds}
        error={timeError}
      />
    )
  } else if (report === 'capacity') {
    // ── Member-level CAPACITY (NON-FINANCIAL) ──
    // SECURITY BOUNDARY: both queries select ONLY non-financial columns — id/status/dates/estimate/
    // owner_id from task, id/full_name from the roster. NO value/cost. Uses ALL tasks (archived
    // clients included) — committed load is load — and the helper excludes Complete/On-Hold from hours.
    const { data: capTasks, error: capErr } = await supabase
      .from('task')
      .select('id, status, due_date, start_date, estimated_hours, owner_id')
    if (capErr) console.error('reports: task (capacity)', capErr)
    // Active roster — id = team_member.id, matching task.owner_id. Every active member gets a row.
    const { data: rosterRows, error: rosterErr } = await supabase.from('team_member').select('id, full_name').eq('is_active', true)
    if (rosterErr) console.error('reports: team_member (roster)', rosterErr)
    const roster = (rosterRows ?? []).map((m) => ({ id: m.id as string, name: (m.full_name as string) ?? 'Unknown' }))
    const capModel = computeCapacity(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (capTasks ?? []).map((t: any) => ({
        owner_id: t.owner_id, status: t.status,
        estimated_hours: t.estimated_hours, start_date: t.start_date, due_date: t.due_date,
      })),
      rangeWeeks(todayMalta(), capWeeks),
      capMode,
      roster,
    )
    content = <CapacityPlanner model={capModel} n={capWeeks} mode={capMode} basePath="/reports" params={{ ...sp }} />
  } else if (report === 'profitability' && access.isAgencyAdmin && access.agencyId) {
    // ───────────────── SECURITY BOUNDARY: Admin-only PROFITABILITY (FINANCIAL) ─────────────────
    // This branch is the ONLY place financial data is fetched or rendered. It runs only when
    // report==='profitability' AND the caller is an agency admin — and the tab is coerced to 'time'
    // for non-admins above, so a non-admin can never reach here. RLS on agency_internal is an
    // admin-only backstop; this is the app-level guarantee.
    const agencyId = access.agencyId

    const { data: agencyInternal, error: aiErr } = await supabase.from('agency_internal').select('cost_per_hour').eq('agency_id', agencyId).maybeSingle()
    if (aiErr) console.error('reports: agency_internal', aiErr)
    const costPerHour = (agencyInternal?.cost_per_hour as number | null) ?? null

    // Cost side: completed time entries in range (whole-team — no ?people filter).
    let entriesQ = supabase
      .from('time_entry')
      .select('task_id, client_id, duration_minutes')
      .gte('started_at', startUTC)
      .lt('started_at', endUTC)
      .not('ended_at', 'is', null)
    if (hasClientFilter) entriesQ = entriesQ.in('client_id', selectedClientIds)
    const { data: entries, error: entErr } = await entriesQ
    if (entErr) console.error('reports: time_entry (profitability)', entErr)

    const taskIds = [...new Set((entries ?? []).map((e: { task_id: string | null }) => e.task_id).filter(Boolean))] as string[]

    // Jobs: client tasks that have a value OR had time in range.
    // The client filter ANDs around the .or(): client_id IN (ids) AND (value not null OR id in taskIds),
    // so the value-not-null branch is client-scoped too — unselected clients' valued jobs aren't pulled in.
    const orFilter = taskIds.length ? `value.not.is.null,id.in.(${taskIds.join(',')})` : 'value.not.is.null'
    let tasksQ = supabase
      .from('task')
      .select('id, title, value, invoice_status, client_id')
      .not('client_id', 'is', null)
    if (hasClientFilter) tasksQ = tasksQ.in('client_id', selectedClientIds)
    const { data: tasks, error: taskErr } = await tasksQ.or(orFilter)
    if (taskErr) console.error('reports: task', taskErr)

    const { data: allClients, error: clErr } = await supabase.from('client').select('id, name')
    if (clErr) console.error('reports: client', clErr)

    const model = computeProfitability(
      (tasks ?? []) as RepTask[],
      (entries ?? []) as RepEntry[],
      (allClients ?? []) as RepClient[],
      costPerHour,
    )

    content = (
      <ProfitabilityReport
        model={model}
        range={range}
        clients={(allClients ?? []) as { id: string; name: string }[]}
        selectedClientIds={selectedClientIds}
      />
    )
  }

  return (
    <PageContainer>
      <ReportTabs active={report} isAgencyAdmin={access.isAgencyAdmin} basePath="/reports" params={{ ...sp }} />
      {content}
    </PageContainer>
  )
}

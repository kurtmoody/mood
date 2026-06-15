import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { zonedDayStartUTC } from '@/lib/week'
import { resolveRange, PRESETS, type Preset } from '@/lib/reportRange'
import { computeProfitability, type RepTask, type RepEntry, type RepClient } from '@/lib/profitability'
import { computeTimeReport, type TimeEntryRow } from '@/lib/timeReport'
import ProfitabilityReport from '@/components/ProfitabilityReport'
import TimeReport from '@/components/TimeReport'
import PageContainer from '@/components/PageContainer'

// /reports is open to ALL agency members. The Time report (below) is member-visible and
// NON-FINANCIAL; the financial Profitability report stays ADMIN-ONLY.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; clients?: string; people?: string }> }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // agency members only (clients / non-members out)

  // Shared date range + filters — members and admins read the SAME ?range/?from/?to/?clients
  // keys (so for admins the two reports stay in sync off one range). ?people is Time-only.
  const sp = await searchParams
  const preset: Preset = PRESETS.includes((sp.range ?? '') as Preset) ? (sp.range as Preset) : 'month'
  const range = resolveRange(preset, sp.from, sp.to)
  const startUTC = zonedDayStartUTC(range.startDate).toISOString()
  const endUTC = zonedDayStartUTC(range.endDate).toISOString()
  const selectedClientIds = (sp.clients ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const selectedPeopleIds = (sp.people ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const hasClientFilter = selectedClientIds.length > 0

  // ───────────────── Member-level TIME report (NON-FINANCIAL) ─────────────────
  // SECURITY BOUNDARY: this query selects ONLY user_id, client_id, task_id, duration_minutes,
  // started_at — NO value, cost or margin from anything. Money lives solely in the admin block
  // below. time_entry RLS (is_agency_member) makes team-wide hours visible to all members.
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

  // All agency clients the member can see — name map + client filter options (shared with admin).
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

  // ───────────────── SECURITY BOUNDARY: Admin-only PROFITABILITY (FINANCIAL) ─────────────────
  // Everything financial lives ONLY inside this admin branch: the cost_per_hour fetch, the valued
  // task fetch, computeProfitability, AND the margin UI (<ProfitabilityReport>). A non-admin
  // request issues NONE of it and renders no margins. RLS on agency_internal is an admin-only
  // backstop; this is the app-level guarantee. (Reuses the range/clients parsed above.)
  let profitability: ReactNode = null
  if (access.isAgencyAdmin && access.agencyId) {
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

    const model = computeProfitability(
      (tasks ?? []) as RepTask[],
      (entries ?? []) as RepEntry[],
      (allClients ?? []) as RepClient[],
      costPerHour,
    )

    profitability = (
      <ProfitabilityReport
        model={model}
        range={range}
        clients={clientOptions}
        selectedClientIds={selectedClientIds}
      />
    )
  }

  return (
    <PageContainer>
      <TimeReport
        model={timeModel}
        range={range}
        clients={clientOptions}
        selectedClientIds={selectedClientIds}
        people={peopleOptions}
        selectedPeopleIds={selectedPeopleIds}
        error={timeError}
      />
      {profitability && <div className="mt-12 border-t border-[#ECECEE] pt-10">{profitability}</div>}
    </PageContainer>
  )
}

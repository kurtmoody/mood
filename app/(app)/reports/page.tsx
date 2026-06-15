import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { zonedDayStartUTC } from '@/lib/week'
import { resolveRange, PRESETS, type Preset } from '@/lib/reportRange'
import { computeProfitability, type RepTask, type RepEntry, type RepClient } from '@/lib/profitability'
import ProfitabilityReport from '@/components/ProfitabilityReport'
import PageContainer from '@/components/PageContainer'

// /reports is open to ALL agency members. Non-financial reports (Time/Capacity, later steps)
// are for everyone; the financial Profitability report stays ADMIN-ONLY.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; clients?: string }> }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // agency members only (clients / non-members out)

  // ───────────────────────── SECURITY BOUNDARY ─────────────────────────
  // Everything financial lives ONLY inside this admin branch: the cost_per_hour fetch, the
  // time_entry/task/client fetches that feed it, computeProfitability, AND the margin UI
  // (<ProfitabilityReport>). A non-admin request issues NONE of these and renders no margins.
  // RLS on agency_internal is an admin-only backstop; this is the app-level guarantee.
  let profitability: ReactNode = null
  if (access.isAgencyAdmin && access.agencyId) {
    const agencyId = access.agencyId

    const sp = await searchParams
    const preset: Preset = PRESETS.includes((sp.range ?? '') as Preset) ? (sp.range as Preset) : 'month'
    const range = resolveRange(preset, sp.from, sp.to)
    const startUTC = zonedDayStartUTC(range.startDate).toISOString()
    const endUTC = zonedDayStartUTC(range.endDate).toISOString()

    // Client scope: ?clients=<comma-separated uuids>. Empty/absent = all clients.
    const selectedClientIds = (sp.clients ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const hasClientFilter = selectedClientIds.length > 0

    const { data: agencyInternal, error: aiErr } = await supabase.from('agency_internal').select('cost_per_hour').eq('agency_id', agencyId).maybeSingle()
    if (aiErr) console.error('reports: agency_internal', aiErr)
    const costPerHour = (agencyInternal?.cost_per_hour as number | null) ?? null

    // Cost side: completed time entries whose start falls in range (RLS scopes to the agency).
    let entriesQ = supabase
      .from('time_entry')
      .select('task_id, client_id, duration_minutes')
      .gte('started_at', startUTC)
      .lt('started_at', endUTC)
      .not('ended_at', 'is', null)
    if (hasClientFilter) entriesQ = entriesQ.in('client_id', selectedClientIds)
    const { data: entries, error: entErr } = await entriesQ
    if (entErr) console.error('reports: time_entry', entErr)

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

    // Full client list for the picker — includes archived (historical money is still money).
    const { data: clients, error: clientErr } = await supabase.from('client').select('id, name')
    if (clientErr) console.error('reports: client', clientErr)

    const model = computeProfitability(
      (tasks ?? []) as RepTask[],
      (entries ?? []) as RepEntry[],
      (clients ?? []) as RepClient[],
      costPerHour,
    )

    profitability = (
      <ProfitabilityReport
        model={model}
        range={range}
        clients={(clients ?? []) as { id: string; name: string }[]}
        selectedClientIds={selectedClientIds}
      />
    )
  }

  return (
    <PageContainer>
      {/* Member-visible placeholder — the Time/Capacity reports land here in a later step. */}
      <div className="text-sm text-[#9398A1] mb-6">Time and capacity reports are coming here.</div>
      {profitability}
    </PageContainer>
  )
}

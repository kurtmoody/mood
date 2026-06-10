import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import { zonedDayStartUTC } from '@/lib/week'
import { resolveRange, PRESETS, type Preset } from '@/lib/reportRange'
import { computeProfitability, type RepTask, type RepEntry, type RepClient } from '@/lib/profitability'
import ProfitabilityReport from '@/components/ProfitabilityReport'

// THE most financially sensitive surface. Agency-admin only — gated exactly like
// /admin/costs: no €/value/cost/margin data is fetched or computed unless the caller is
// an admin (the redirect runs first). Margins live ONLY here, never on /dashboard.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (!access.isAgencyAdmin || !access.agencyId) redirect('/') // admin-only financial data
  const agencyId = access.agencyId

  const sp = await searchParams
  const preset: Preset = PRESETS.includes((sp.range ?? '') as Preset) ? (sp.range as Preset) : 'month'
  const range = resolveRange(preset, sp.from, sp.to)
  const startUTC = zonedDayStartUTC(range.startDate).toISOString()
  const endUTC = zonedDayStartUTC(range.endDate).toISOString()

  const { data: agencyInternal } = await supabase.from('agency_internal').select('cost_per_hour').eq('agency_id', agencyId).maybeSingle()
  const costPerHour = (agencyInternal?.cost_per_hour as number | null) ?? null

  // Cost side: completed time entries whose start falls in range (RLS scopes to the agency).
  const { data: entries } = await supabase
    .from('time_entry')
    .select('task_id, client_id, duration_minutes')
    .gte('started_at', startUTC)
    .lt('started_at', endUTC)
    .not('ended_at', 'is', null)

  const taskIds = [...new Set((entries ?? []).map((e: { task_id: string | null }) => e.task_id).filter(Boolean))] as string[]

  // Jobs: client tasks that have a value OR had time in range.
  const orFilter = taskIds.length ? `value.not.is.null,id.in.(${taskIds.join(',')})` : 'value.not.is.null'
  const { data: tasks } = await supabase
    .from('task')
    .select('id, title, value, invoice_status, client_id')
    .not('client_id', 'is', null)
    .or(orFilter)

  const { data: clients } = await supabase.from('client').select('id, name')

  const model = computeProfitability(
    (tasks ?? []) as RepTask[],
    (entries ?? []) as RepEntry[],
    (clients ?? []) as RepClient[],
    costPerHour,
  )

  return <ProfitabilityReport model={model} range={range} />
}

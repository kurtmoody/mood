import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import PageContainer from '@/components/PageContainer'
import CampaignsIndex, { type IndexCampaign } from './CampaignsIndex'

export default async function CampaignsIndexPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // internal-only

  // All independent — one parallel round. RLS scopes campaign/task to the agency.
  const [{ data: campaigns }, { data: tasks }, { data: clients }] = await Promise.all([
    supabase
      .from('campaign')
      .select('id, client_id, name, objective, phase, start_date, end_date, media_budget')
      .order('created_at', { ascending: false }),
    // Task counts across all campaigns — one query, grouped in JS (no N+1).
    supabase.from('task').select('campaign_id, status').not('campaign_id', 'is', null),
    supabase.from('client').select('id, name, status').order('name'),
  ])

  const clientById = new Map(((clients as { id: string; name: string; status: string }[] | null) ?? []).map((c) => [c.id, c]))

  const taskAgg = new Map<string, { complete: number; total: number }>()
  for (const t of (tasks as { campaign_id: string | null; status: string }[] | null) ?? []) {
    if (!t.campaign_id) continue
    const e = taskAgg.get(t.campaign_id) ?? { complete: 0, total: 0 }
    e.total++
    if (t.status === 'Complete') e.complete++
    taskAgg.set(t.campaign_id, e)
  }

  const rows: IndexCampaign[] = ((campaigns as any[] | null) ?? []).map((c) => {
    const cli = clientById.get(c.client_id)
    return {
      id: c.id,
      clientId: c.client_id,
      clientName: cli?.name ?? 'Unknown client',
      clientArchived: cli?.status === 'archived',
      name: c.name,
      objective: c.objective,
      phase: c.phase,
      start_date: c.start_date,
      end_date: c.end_date,
      media_budget: c.media_budget,
      taskComplete: taskAgg.get(c.id)?.complete ?? 0,
      taskTotal: taskAgg.get(c.id)?.total ?? 0,
    }
  })

  const clientOptions = ((clients as { id: string; name: string; status: string }[] | null) ?? [])
    .filter((c) => c.status !== 'archived')
    .map((c) => ({ id: c.id, name: c.name }))

  return (
    <PageContainer>
      <CampaignsIndex campaigns={rows} clients={clientOptions} />
    </PageContainer>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import PageContainer from '@/components/PageContainer'
import TemplatesManager, { type Template } from './TemplatesManager'

// Agency-only. Reachable from the /campaigns index header ("Templates" link), not the sidebar.
export default async function TemplatesPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (access.type !== 'agency') redirect('/') // internal-only

  const [{ data: templates }, { data: tasks }] = await Promise.all([
    supabase.from('campaign_template').select('id, name, objective').order('created_at', { ascending: false }),
    supabase
      .from('campaign_template_task')
      .select('id, template_id, title, task_type, estimated_hours, start_offset_days, due_offset_days, sort_order')
      .order('sort_order')
      .order('id'),
  ])

  const byTemplate = new Map<string, any[]>()
  for (const t of (tasks ?? []) as any[]) {
    const arr = byTemplate.get(t.template_id) ?? []
    arr.push(t)
    byTemplate.set(t.template_id, arr)
  }
  const rows: Template[] = ((templates ?? []) as any[]).map((t) => ({ ...t, tasks: byTemplate.get(t.id) ?? [] }))

  return (
    <PageContainer>
      <TemplatesManager templates={rows} />
    </PageContainer>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import RaciEditor from './RaciEditor'

export default async function RaciAdminPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (!access.isAgencyAdmin || !access.agencyId) redirect('/') // layout also gates; belt + braces
  const agencyId = access.agencyId

  const { data: team, error: tErr } = await supabase
    .from('team_member')
    .select('id, full_name')
    .eq('agency_id', agencyId)
    .eq('is_active', true)
    .order('full_name')
  const { data: cells, error: cErr } = await supabase
    .from('raci_matrix')
    .select('task_type, team_member_id, raci_value')
    .eq('agency_id', agencyId)
  if (tErr) console.error('raci team query failed:', tErr.message, tErr.code)
  if (cErr) console.error('raci cells query failed:', cErr.message, cErr.code)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">RACI matrix</h1>
        <Link href="/admin" className="text-sm text-[#5A5E66] hover:underline">← Admin</Link>
      </div>
      <p className="text-sm text-[#9398A1] mb-8">Who&rsquo;s accountable (A), responsible (R), supporting (S), consulted (C) or informed (I) for each task type. A/R = accountable &amp; responsible.</p>

      <RaciEditor
        agencyId={agencyId}
        members={(team ?? []).map((m: { id: string; full_name: string }) => ({ id: m.id, full_name: m.full_name }))}
        cells={(cells ?? []) as { task_type: string; team_member_id: string; raci_value: string }[]}
        loadError={!!tErr || !!cErr}
      />
    </div>
  )
}

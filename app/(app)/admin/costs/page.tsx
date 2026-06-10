import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import CostEditor from './CostEditor'
import PageContainer from '@/components/PageContainer'

export default async function CostsPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (!access.isAgencyAdmin || !access.agencyId) redirect('/') // layout also gates; belt + braces
  const agencyId = access.agencyId

  const { data: agency, error } = await supabase
    .from('agency_internal')
    .select('cost_per_hour')
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (error) console.error('agency cost query failed:', error.message, error.code)

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Cost per hour</h1>
        <Link href="/admin" className="text-sm text-[#5A5E66] hover:underline">← Admin</Link>
      </div>
      <p className="text-sm text-[#9398A1] mb-8">The agency&rsquo;s blended internal cost rate, for profitability reporting.</p>

      <CostEditor agencyId={agencyId} current={(agency?.cost_per_hour as number | null) ?? null} />
    </PageContainer>
  )
}

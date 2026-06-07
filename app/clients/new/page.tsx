import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageShell from '@/components/PageShell'
import NewClientForm from './NewClientForm'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')

  return (
    <PageShell current="clients">
      <div className="mb-5">
        <div className="text-xl font-bold">New client</div>
        <div className="text-sm text-[#5A5E66]">Add a client to your agency.</div>
      </div>
      <NewClientForm />
    </PageShell>
  )
}

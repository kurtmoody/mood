import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientsTable, { type Client } from './ClientsTable'
import PageContainer from '@/components/PageContainer'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Agency-only: the user must hold an agency membership. Admin gates the list delete.
  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id, role')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')
  const isAdmin = agencyMemberships.some((m) => m.role === 'agency_admin')

  // RLS already scopes clients to the agency. Primary contact comes from the
  // agency-only client_contact table, filtered to the single is_primary row.
  const { data: clients } = await supabase
    .from('client')
    .select('id, name, status, industry, primary_contact:client_contact ( first_name, surname, email )')
    .eq('primary_contact.is_primary', true)
    .order('name')

  const rows = (clients as Client[] | null) ?? []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xl font-bold">Clients</div>
          <div className="text-sm text-[#5A5E66]">{rows.length} {rows.length === 1 ? 'client' : 'clients'}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/clients/ownership" className="text-sm border border-[#E2E2E5] text-[#5A5E66] rounded-lg px-3.5 py-2 font-medium hover:bg-[#F4F4F6]">
            Ownership matrix
          </Link>
          <Link
            href="/clients/new"
            className="text-sm bg-[#15171C] text-white rounded-lg px-3.5 py-2 font-semibold"
          >
            New client
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
          <div className="text-sm font-semibold mb-1">No clients yet</div>
          <div className="text-sm text-[#5A5E66]">Clients you manage will appear here.</div>
        </div>
      ) : (
        <ClientsTable rows={rows} isAdmin={isAdmin} />
      )}
    </PageContainer>
  )
}

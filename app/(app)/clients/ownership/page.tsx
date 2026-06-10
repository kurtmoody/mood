import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OWNERSHIP_ROLES, type Ownership } from '@/lib/ownershipRoles'
import PageContainer from '@/components/PageContainer'

export default async function OwnershipMatrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agencyMemberships } = await supabase.from('membership').select('scope_id').eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')

  // RLS scopes all three to the agency. Don't swallow errors.
  const { data: clients, error: cErr } = await supabase.from('client').select('id, name').order('name')
  const { data: ownership, error: oErr } = await supabase
    .from('client_ownership')
    .select('client_id, lead_pm_id, comms_backup_id, creative_lead_id, design_owner_id, content_owner_id, video_owner_id, sales_ops_id, intern_support_id')
  const { data: team } = await supabase.from('team_member').select('id, full_name')
  const loadError = !!cErr || !!oErr
  if (cErr) console.error('ownership matrix clients query failed:', cErr.message, cErr.code)
  if (oErr) console.error('ownership matrix query failed:', oErr.message, oErr.code)

  const nameById = new Map((team ?? []).map((t: { id: string; full_name: string }) => [t.id, t.full_name]))
  const ownByClient = new Map((ownership ?? []).map((o: { client_id: string } & Ownership) => [o.client_id, o]))
  const rows = (clients as { id: string; name: string }[] | null) ?? []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xl font-bold">Client ownership</div>
          <div className="text-sm text-[#5A5E66]">Who owns what, across all clients. Edit on each client&rsquo;s page.</div>
        </div>
        <Link href="/clients" className="text-sm text-[#5A5E66] hover:underline">← Clients</Link>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">⚠️ Couldn&rsquo;t load the ownership matrix. Please refresh.</div>
      )}

      {rows.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center text-sm text-[#5A5E66]">No clients yet.</div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
                <th className="font-semibold px-4 py-2.5 sticky left-0 bg-white">Client</th>
                {OWNERSHIP_ROLES.map((r) => <th key={r.key} className="font-semibold px-3 py-2.5 whitespace-nowrap">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const own = ownByClient.get(c.id) as Ownership | undefined
                return (
                  <tr key={c.id} className="border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC]">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">
                      <Link href={`/clients/${c.id}`} className="hover:underline">{c.name}</Link>
                    </td>
                    {OWNERSHIP_ROLES.map((r) => {
                      const id = own?.[r.key] ?? null
                      const name = id ? nameById.get(id) : null
                      return <td key={r.key} className="px-3 py-2.5 whitespace-nowrap text-[#5A5E66]">{name ?? <span className="text-[#C0C4CC]">—</span>}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  )
}

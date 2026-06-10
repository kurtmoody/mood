import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import AccessEditor, { type AccessMember } from './AccessEditor'
import InvitePanel, { type Invite } from '../../InvitePanel'

export default async function AccessPage() {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (!access.isAgencyAdmin || !access.agencyId) redirect('/') // layout also gates; belt + braces
  const agencyId = access.agencyId

  // membership is own-rows-only under RLS → list via the admin-only SECURITY DEFINER RPC.
  const { data: members, error } = await supabase.rpc('list_agency_members', { p_agency_id: agencyId })
  if (error) console.error('list_agency_members failed:', error.message, error.code)

  const { data: invites } = await supabase
    .from('invite')
    .select('id, email, role, created_at, expires_at')
    .eq('scope_type', 'agency')
    .eq('scope_id', agencyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Team access</h1>
        <Link href="/admin" className="text-sm text-[#5A5E66] hover:underline">← Admin</Link>
      </div>
      <p className="text-sm text-[#9398A1] mb-8">Who can administer Mood.</p>

      <AccessEditor
        agencyId={agencyId}
        currentUserId={access.userId}
        members={(members ?? []).map((m: { user_id: string; role: string; full_name: string; email: string | null }): AccessMember => ({
          userId: m.user_id, role: m.role, fullName: m.full_name, email: m.email,
        }))}
        loadError={!!error}
      />

      <div className="mt-8">
        <InvitePanel
          scopeType="agency"
          scopeId={agencyId}
          revalidate="/admin/access"
          invites={(invites as Invite[] | null) ?? []}
        />
      </div>
    </div>
  )
}

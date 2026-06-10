import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AddTeamMemberForm from './AddTeamMemberForm'
import TeamList, { type Member } from './TeamList'
import PageContainer from '@/components/PageContainer'

type Row = {
  id: string
  full_name: string
  role: string | null
  email: string | null
  is_active: boolean
  user_id: string | null
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id, role')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')
  const isAdmin = agencyMemberships.some((m) => m.role === 'agency_admin')

  const { data: members } = await supabase
    .from('team_member')
    .select('id, full_name, role, email, is_active, user_id')
    .order('created_at')

  const rows = (members as Row[] | null) ?? []
  const list: Member[] = rows.map((m) => ({
    id: m.id,
    full_name: m.full_name,
    role: m.role,
    email: m.email,
    is_active: m.is_active,
    has_login: !!m.user_id,
  }))

  return (
    <PageContainer>
      <div className="mb-5">
        <div className="text-xl font-bold">Team</div>
        <div className="text-sm text-[#5A5E66]">{rows.length} {rows.length === 1 ? 'member' : 'members'}</div>
      </div>

      <div className="flex flex-col gap-5">
        {rows.length === 0 ? (
          <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
            <div className="text-sm font-semibold mb-1">No team members yet</div>
            <div className="text-sm text-[#5A5E66]">Add your agency&apos;s staff below.</div>
          </div>
        ) : (
          <TeamList members={list} isAdmin={isAdmin} />
        )}

        <AddTeamMemberForm />
      </div>
    </PageContainer>
  )
}

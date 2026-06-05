import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import AddTeamMemberForm from './AddTeamMemberForm'

type Member = {
  id: string
  full_name: string
  role: string | null
  email: string | null
  is_active: boolean
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')

  const { data: members } = await supabase
    .from('team_member')
    .select('id, full_name, role, email, is_active')
    .order('created_at')

  const rows = (members as Member[] | null) ?? []

  return (
    <main className="max-w-[1240px] mx-auto p-6 bg-[#FBFBFC] min-h-screen text-[#15171C]">
      <Nav current="team" />
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
          <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1fr_1.4fr_auto] gap-4 px-5 py-2.5 border-b border-[#ECECEE] text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
              <div>Name</div>
              <div>Role</div>
              <div>Email</div>
              <div>Status</div>
            </div>
            {rows.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[1.4fr_1fr_1.4fr_auto] gap-4 px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 items-center"
              >
                <div className="text-sm font-semibold">{m.full_name}</div>
                <div className="text-sm text-[#5A5E66]">{m.role ?? '—'}</div>
                <div className="text-sm text-[#5A5E66]">{m.email ?? '—'}</div>
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.is_active ? '#16A34A' : '#A6ABB3' }} />
                    {m.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <AddTeamMemberForm />
      </div>
    </main>
  )
}

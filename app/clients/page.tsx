import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'

const CLIENT_STATUS: Record<string, { dot: string; label: string }> = {
  prospect: { dot: '#3B82F6', label: 'Prospect' },
  active:   { dot: '#16A34A', label: 'Active' },
  paused:   { dot: '#E8920C', label: 'Paused' },
  archived: { dot: '#A6ABB3', label: 'Archived' },
}

type Contact = { name: string; email: string | null }
type Client = {
  id: string
  name: string
  status: string | null
  industry: string | null
  primary_contact: Contact[] | null
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Agency-only: the user must hold an agency membership.
  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')

  // RLS already scopes clients to the agency. Primary contact comes from the
  // agency-only client_contact table, filtered to the single is_primary row.
  const { data: clients } = await supabase
    .from('client')
    .select('id, name, status, industry, primary_contact:client_contact ( name, email )')
    .eq('primary_contact.is_primary', true)
    .order('name')

  const rows = (clients as Client[] | null) ?? []

  return (
    <main className="max-w-[1240px] mx-auto p-6 bg-[#FBFBFC] min-h-screen text-[#15171C]">
      <Nav current="clients" />
      <div className="mb-5">
        <div className="text-xl font-bold">Clients</div>
        <div className="text-sm text-[#5A5E66]">{rows.length} {rows.length === 1 ? 'client' : 'clients'}</div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
          <div className="text-sm font-semibold mb-1">No clients yet</div>
          <div className="text-sm text-[#5A5E66]">Clients you manage will appear here.</div>
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          <div className="grid grid-cols-[1.6fr_1fr_1.6fr] gap-4 px-5 py-2.5 border-b border-[#ECECEE] text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
            <div>Client</div>
            <div>Industry</div>
            <div>Primary contact</div>
          </div>
          {rows.map((c) => {
            const s = CLIENT_STATUS[c.status ?? ''] ?? { dot: '#A6ABB3', label: c.status ?? 'Unknown' }
            const contact = c.primary_contact?.[0] ?? null
            return (
              <div
                key={c.id}
                className="grid grid-cols-[1.6fr_1fr_1.6fr] gap-4 px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 items-center"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                    {s.label}
                  </span>
                </div>
                <div className="text-sm text-[#5A5E66]">{c.industry ?? '—'}</div>
                <div className="text-sm">
                  {contact ? (
                    <>
                      <span>{contact.name}</span>
                      {contact.email && <span className="text-[#9398A1]"> · {contact.email}</span>}
                    </>
                  ) : (
                    <span className="text-[#9398A1]">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Calendar from '@/components/Calendar'
import ClientSwitcher from '@/components/ClientSwitcher'

export default async function Home({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Clients the user can see (RLS scopes to their agency's clients).
  const { data: clients } = await supabase
    .from('client')
    .select('id, name')
    .order('name')
  const clientList = clients ?? []

  if (clientList.length === 0) {
    return (
      <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
        <div className="text-sm font-semibold mb-1">No clients yet</div>
        <div className="text-sm text-[#5A5E66]">Add a client to start planning content.</div>
      </div>
    )
  }

  // Selected client from ?client=, falling back to the first one.
  const { client: requested } = await searchParams
  const selected = clientList.find((c) => c.id === requested) ?? clientList[0]

  const { data: items } = await supabase
    .from('content_item')
    .select('id, title, content_type, scheduled_at, status, current_version_id, channel:channel_id ( type, label ), versions:content_version ( id, body, version_no )')
    .eq('client_id', selected.id)
    .order('scheduled_at')

  // Body is versioned — resolve each item's current version (or the latest) server-side.
  const posts = (items ?? []).map((it: any) => {
    const versions = it.versions ?? []
    const current =
      versions.find((v: any) => v.id === it.current_version_id) ??
      [...versions].sort((a: any, b: any) => b.version_no - a.version_no)[0]
    return { ...it, body: current?.body ?? null }
  })

  return (
    <>
      <div className="mb-5">
        <ClientSwitcher clients={clientList} current={selected.id} />
        <div className="text-sm text-[#5A5E66] mt-1.5">Content calendar · this week</div>
      </div>
      <Calendar items={posts} />
    </>
  )
}

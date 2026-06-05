import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Calendar from '@/components/Calendar'
import Nav from '@/components/Nav'

const HOTEL_VALENTINA = '00000000-0000-0000-0000-000000000002'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: items } = await supabase
    .from('content_item')
    .select('id, title, content_type, scheduled_at, status, current_version_id, channel:channel_id ( type, label ), versions:content_version ( id, body, version_no )')
    .eq('client_id', HOTEL_VALENTINA)
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
    <main className="max-w-[1240px] mx-auto p-6 bg-[#FBFBFC] min-h-screen text-[#15171C]">
      <Nav current="calendar" />
      <div className="mb-5">
        <div className="text-xl font-bold">Hotel Valentina</div>
        <div className="text-sm text-[#5A5E66]">Content calendar · this week</div>
      </div>
      <Calendar items={posts} />
    </main>
  )
}

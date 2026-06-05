import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Calendar from '@/components/Calendar'
import LogoutButton from '@/components/LogoutButton'

const HOTEL_VALENTINA = '00000000-0000-0000-0000-000000000002'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: items } = await supabase
    .from('content_item')
    .select('id, title, content_type, scheduled_at, status, channel:channel_id ( type, label )')
    .eq('client_id', HOTEL_VALENTINA)
    .order('scheduled_at')

  return (
    <main className="max-w-[1240px] mx-auto p-6 bg-[#FBFBFC] min-h-screen text-[#15171C]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xl font-bold">Hotel Valentina</div>
          <div className="text-sm text-[#5A5E66]">Content calendar · this week</div>
        </div>
        <LogoutButton />
      </div>
      <Calendar items={(items as any) ?? []} />
    </main>
  )
}

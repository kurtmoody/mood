import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')

  return <AppShell email={access.email} isAgency={access.type === 'agency'}>{children}</AppShell>
}

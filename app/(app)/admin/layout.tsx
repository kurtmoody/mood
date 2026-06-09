import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccess } from '@/lib/access'

// Hard gate for everything under /admin — agency_admin only (mirrors how /clients gates
// non-agency, but on the role). The set_* RPCs re-check admin server-side too.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const access = await getAccess(supabase)
  if (!access) redirect('/login')
  if (!access.isAgencyAdmin) redirect('/')
  return <>{children}</>
}

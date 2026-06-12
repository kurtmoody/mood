'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type AccessResult = { error: string | null }

export async function setMemberRoleAction(targetUserId: string, agencyId: string, role: string): Promise<AccessResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('set_member_role', {
    p_target_user_id: targetUserId,
    p_agency_id: agencyId,
    p_role: role,
  })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath('/admin/access')
  return { error: null }
}

import type { SupabaseClient } from '@supabase/supabase-js'

export type Access = {
  userId: string
  email: string
  type: 'agency' | 'client' | 'none'
  clientIds: string[]
}

// Determine the current user's access from their membership rows. Read directly
// (rather than via is_client_user()) so a client user also gets the list of client
// ids they belong to in the same query. Returns null if not authenticated.
//
// agency-scope membership present → 'agency'; only client-scope → 'client'; none → 'none'.
export async function getAccess(supabase: SupabaseClient): Promise<Access | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: memberships } = await supabase
    .from('membership')
    .select('scope_type, scope_id')
  const rows = memberships ?? []

  const hasAgency = rows.some((m) => m.scope_type === 'agency')
  const clientIds = rows.filter((m) => m.scope_type === 'client').map((m) => m.scope_id as string)
  const type: Access['type'] = hasAgency ? 'agency' : clientIds.length > 0 ? 'client' : 'none'

  return { userId: user.id, email: user.email ?? '', type, clientIds }
}

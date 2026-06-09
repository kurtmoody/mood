import type { SupabaseClient } from '@supabase/supabase-js'

export type Access = {
  userId: string
  email: string
  type: 'agency' | 'client' | 'none'
  clientIds: string[]
  agencyId: string | null      // first agency-scope membership (the user's agency)
  isAgencyAdmin: boolean        // holds an agency_admin role (admin-level config gate)
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
    .select('scope_type, scope_id, role')
  const rows = memberships ?? []

  const agencyRows = rows.filter((m) => m.scope_type === 'agency')
  const clientIds = rows.filter((m) => m.scope_type === 'client').map((m) => m.scope_id as string)
  const type: Access['type'] = agencyRows.length > 0 ? 'agency' : clientIds.length > 0 ? 'client' : 'none'
  const agencyId = (agencyRows[0]?.scope_id as string | undefined) ?? null
  const isAgencyAdmin = agencyRows.some((m) => m.role === 'agency_admin')

  return { userId: user.id, email: user.email ?? '', type, clientIds, agencyId, isAgencyAdmin }
}

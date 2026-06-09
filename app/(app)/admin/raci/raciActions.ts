'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type RaciCell = { task_type: string; team_member_id: string; raci_value: string }
export type RaciResult = { error: string | null }

export async function setRaciMatrixAction(agencyId: string, cells: RaciCell[]): Promise<RaciResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('set_raci_matrix', { p_agency_id: agencyId, p_cells: cells })
  if (error) return { error: error.message }
  revalidatePath('/admin/raci')
  return { error: null }
}

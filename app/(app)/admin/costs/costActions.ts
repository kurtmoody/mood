'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CostState = { error: string | null; ok: boolean }

export async function setAgencyCostPerHourAction(_prev: CostState, formData: FormData): Promise<CostState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', ok: false }

  const agencyId = (formData.get('agency_id') as string | null)?.trim()
  if (!agencyId) return { error: 'Missing agency.', ok: false }

  const raw = (formData.get('rate') as string | null)?.trim() ?? ''
  let rate: number | null = null
  if (raw !== '') {
    rate = Number(raw)
    if (Number.isNaN(rate)) return { error: 'Rate must be a number.', ok: false }
    if (rate < 0) return { error: 'Rate must be 0 or more.', ok: false }
  }

  const { error } = await supabase.rpc('set_agency_cost_per_hour', { p_agency_id: agencyId, p_rate: rate })
  if (error) return { error: error.message, ok: false }

  revalidatePath('/admin/costs')
  return { error: null, ok: true }
}

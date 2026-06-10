'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Lightweight status change (archive / reactivate) via the minimal set_client_status RPC.
export async function setClientStatusAction(
  clientId: string,
  status: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('set_client_status', { p_client_id: clientId, p_status: status })
  if (error) return { error: error.message }
  revalidatePath('/clients')
  return { error: null }
}

// List delete — reuses the existing delete_client RPC unchanged (no new delete logic).
// Unlike the detail page's action it revalidates instead of redirecting (we stay on /clients).
export async function deleteClientFromListAction(clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('delete_client', { p_id: clientId })
  if (error) return { error: error.message }
  revalidatePath('/clients')
  return { error: null }
}

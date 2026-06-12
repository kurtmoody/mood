'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type OwnershipState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

export async function setClientOwnershipAction(_prev: OwnershipState, fd: FormData): Promise<OwnershipState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }

  const { error } = await supabase.rpc('set_client_ownership', {
    p_client_id: clientId,
    p_lead_pm_id: str(fd, 'lead_pm_id'),
    p_comms_backup_id: str(fd, 'comms_backup_id'),
    p_creative_lead_id: str(fd, 'creative_lead_id'),
    p_design_owner_id: str(fd, 'design_owner_id'),
    p_content_owner_id: str(fd, 'content_owner_id'),
    p_video_owner_id: str(fd, 'video_owner_id'),
    p_sales_ops_id: str(fd, 'sales_ops_id'),
    p_intern_support_id: str(fd, 'intern_support_id'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients/ownership')
  return { error: null, ok: true }
}

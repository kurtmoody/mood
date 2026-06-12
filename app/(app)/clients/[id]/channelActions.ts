'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ChannelState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

async function authedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

export async function addChannelAction(_prev: ChannelState, fd: FormData): Promise<ChannelState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }
  const type = str(fd, 'type')
  if (!type) return { error: 'Channel type is required.', ok: false }

  const { error } = await supabase.rpc('add_channel', {
    p_client_id: clientId,
    p_type: type,
    p_label: str(fd, 'label'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function deleteChannelAction(_prev: ChannelState, fd: FormData): Promise<ChannelState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const channelId = str(fd, 'channel_id')
  if (!channelId) return { error: 'Missing channel id.', ok: false }

  const { error } = await supabase.rpc('delete_channel', { p_channel_id: channelId })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

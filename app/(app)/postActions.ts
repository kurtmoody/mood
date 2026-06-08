'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type PostState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

export async function createPostAction(_prev: PostState, fd: FormData): Promise<PostState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Client is required.', ok: false }
  const scheduledAt = str(fd, 'scheduled_at') // ISO string, converted client-side
  if (!scheduledAt) return { error: 'Scheduled date is required.', ok: false }

  const { error } = await supabase.rpc('create_post', {
    p_client_id: clientId,
    p_channel_id: str(fd, 'channel_id'),
    p_title: str(fd, 'title'),
    p_content_type: str(fd, 'content_type') ?? 'post',
    p_scheduled_at: scheduledAt,
    p_body: str(fd, 'body'),
  })
  if (error) return { error: error.message, ok: false }

  revalidatePath('/')
  return { error: null, ok: true }
}

export async function updatePostAction(_prev: PostState, fd: FormData): Promise<PostState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const itemId = str(fd, 'item_id')
  if (!itemId) return { error: 'Missing post.', ok: false }

  const { error } = await supabase.rpc('update_post', {
    p_item_id: itemId,
    p_title: str(fd, 'title'),
    p_channel_id: str(fd, 'channel_id'),
    p_scheduled_at: str(fd, 'scheduled_at'), // ISO string, converted client-side
    p_body: str(fd, 'body'),
  })
  if (error) return { error: error.message, ok: false }

  revalidatePath('/')
  return { error: null, ok: true }
}

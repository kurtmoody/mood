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

// Drag-to-reschedule (agency-only, enforced in the RPC). Direct-call, like the kanban
// drag — no form. Only moves the date (+ optional mark-posted); never forks a version.
export async function reschedulePostAction(
  itemId: string,
  scheduledAtISO: string,
  markPosted: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('reschedule_content_item', {
    p_id: itemId,
    p_scheduled_at: scheduledAtISO,
    p_mark_posted: markPosted,
  })
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function updatePostAction(_prev: PostState, fd: FormData): Promise<PostState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const itemId = str(fd, 'item_id')
  if (!itemId) return { error: 'Missing post.', ok: false }

  const { data, error } = await supabase.rpc('update_post', {
    p_item_id: itemId,
    p_title: str(fd, 'title'),
    p_channel_id: str(fd, 'channel_id'),
    p_scheduled_at: str(fd, 'scheduled_at'), // ISO string, converted client-side
    p_body: str(fd, 'body'),
  })
  if (error) return { error: error.message, ok: false }

  // (a) Fork media copies: a frozen-status edit forks v2 and returns the
  // {old_path,new_path} pairs for its media; copy each storage object to the new
  // version's path BEFORE the refresh so v2's files exist when the calendar re-renders.
  // In-place edits return [] → no-op. A copy failure is logged and skipped — v1's
  // files are untouched and the app shows a placeholder for a missing object, so a
  // partial copy is recoverable, not corrupting.
  const pairs = (data as { old_path: string; new_path: string }[] | null) ?? []
  for (const { old_path, new_path } of pairs) {
    const { error: copyErr } = await supabase.storage.from('content-media').copy(old_path, new_path)
    if (copyErr) console.error(`update_post: media copy failed ${old_path} → ${new_path}: ${copyErr.message}`)
  }

  revalidatePath('/')
  return { error: null, ok: true }
}

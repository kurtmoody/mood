'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
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

  // Multi-channel (0054): the form submits a comma-separated channel_ids list. Empty → no channel.
  const channelIds = ((fd.get('channel_ids') as string | null) ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  const { error } = await supabase.rpc('create_post', {
    p_client_id: clientId,
    p_title: str(fd, 'title'),
    p_content_type: str(fd, 'content_type') ?? 'post',
    p_scheduled_at: scheduledAt,
    p_body: str(fd, 'body'),
    p_visual_content: str(fd, 'visual_content'),
    p_channel_ids: channelIds,
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

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
  if (error) return { error: rpcErrorMessage(error) }

  revalidatePath('/')
  return { error: null }
}

// Production metadata (Drive links, design sub-status, boost/budget, posted date,
// designer) — written via the lightweight set_post_meta RPC so it NEVER forks a version
// or changes the approval status. Direct-call (no form); agency-only enforced in the RPC.
export async function setPostMetaAction(
  itemId: string,
  meta: {
    designer_id: string | null
    design_status: string | null
    drive_url: string | null
    high_res_url: string | null
    boost: boolean
    ad_budget: number | null
    date_posted: string | null
    posted_url: string | null
    campaign_id: string | null
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('set_post_meta', {
    p_id: itemId,
    p_designer_id: meta.designer_id,
    p_design_status: meta.design_status,
    p_drive_url: meta.drive_url,
    p_high_res_url: meta.high_res_url,
    p_boost: meta.boost,
    p_ad_budget: meta.ad_budget,
    p_date_posted: meta.date_posted,
    p_posted_url: meta.posted_url,
    p_campaign_id: meta.campaign_id,
  })
  if (error) return { error: rpcErrorMessage(error) }
  revalidatePath('/')
  return { error: null }
}

// Set a post's channel set (0054). Direct-call (array, not a form); agency-only enforced in the
// RPC, which validates each channel belongs to the post's client, replaces the join rows, and
// sets the denormalised channel_id to the first. Never forks a version or changes status.
export async function setPostChannelsAction(
  itemId: string,
  channelIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('set_post_channels', { p_item_id: itemId, p_channel_ids: channelIds })
  if (error) return { error: rpcErrorMessage(error) }

  revalidatePath('/')
  return { error: null }
}

// Tailor a channel off a multi-channel post (0055): split_post_channel peels p_channel_id into
// its own draft post and returns the new id + the {old_path,new_path} media pairs. We copy each
// storage object with the SAME loop/bucket as the fork copy (log-and-skip — a partial copy is
// recoverable, not corrupting), then the caller opens the new draft. Agency-only (RPC-enforced).
export async function splitPostChannelAction(
  itemId: string,
  channelId: string,
): Promise<{ ok: true; newItemId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data, error } = await supabase.rpc('split_post_channel', { p_item_id: itemId, p_channel_id: channelId })
  if (error) return { error: rpcErrorMessage(error) }

  const result = (data ?? {}) as { new_item_id?: string; media?: { old_path: string; new_path: string }[] }
  for (const { old_path, new_path } of result.media ?? []) {
    const { error: copyErr } = await supabase.storage.from('content-media').copy(old_path, new_path)
    if (copyErr) console.error(`split_post_channel: media copy failed ${old_path} → ${new_path}: ${copyErr.message}`)
  }

  revalidatePath('/')
  if (!result.new_item_id) return { error: 'Split did not return a new post.' }
  return { ok: true, newItemId: result.new_item_id }
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
    // Channels are edited separately now (set_post_channels, 0054) — the edit form has no
    // channel field. update_post still requires p_channel_id, and null preserves the existing
    // channel via its coalesce, so caption/title/schedule edits never touch channels.
    p_channel_id: null,
    p_scheduled_at: str(fd, 'scheduled_at'), // ISO string, converted client-side
    p_body: str(fd, 'body'),
    p_visual_content: str(fd, 'visual_content'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

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

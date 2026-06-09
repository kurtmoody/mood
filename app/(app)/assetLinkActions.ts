'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type LinkResult = { error: string | null }

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

export async function addAssetLinkAction(contentItemId: string, label: string, url: string): Promise<LinkResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('add_asset_link', { p_content_item_id: contentItemId, p_label: label, p_url: url })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { error: null }
}

export async function updateAssetLinkAction(linkId: string, label: string, url: string): Promise<LinkResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('update_asset_link', { p_link_id: linkId, p_label: label, p_url: url })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { error: null }
}

export async function deleteAssetLinkAction(linkId: string): Promise<LinkResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('delete_asset_link', { p_link_id: linkId })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { error: null }
}

export async function reorderAssetLinkAction(contentItemId: string, orderedIds: string[]): Promise<LinkResult> {
  const supabase = await authed()
  const { error } = await supabase.rpc('reorder_asset_link', { p_content_item_id: contentItemId, p_ordered_ids: orderedIds })
  if (error) return { error: error.message }
  revalidatePath('/')
  return { error: null }
}

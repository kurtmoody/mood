'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type MetaLinkState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

// Save the linked Meta campaign IDs + optional results-action override. The IDs field is free
// text (Ads Manager pastes are comma/space/newline separated); we split into tokens and let the
// RPC trim / dedupe / numeric-validate.
export async function setCampaignMetaLinksAction(_prev: MetaLinkState, fd: FormData): Promise<MetaLinkState> {
  const supabase = await authed()
  const campaignId = str(fd, 'campaign_id')
  if (!campaignId) return { error: 'Missing campaign id.', ok: false }

  const raw = (fd.get('meta_campaign_ids') as string | null) ?? ''
  const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)

  const { error } = await supabase.rpc('set_campaign_meta_links', {
    p_id: campaignId,
    p_meta_campaign_ids: ids,
    p_meta_results_action: str(fd, 'meta_results_action'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

// "Sync now" — the smoke test / impatience valve. Gate on the caller being able to read the
// campaign (agency-for-client, via RLS), then invoke the meta-sync Edge Function for this one
// campaign. The function does the Meta pull + DB writes as its own service role.
export async function syncNowAction(campaignId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // RLS returns the row only to an agency member of the campaign's agency.
  const { data: campaign } = await supabase.from('campaign').select('id').eq('id', campaignId).maybeSingle()
  if (!campaign) return { error: 'Not authorised for this campaign.' }

  const { error } = await supabase.functions.invoke('meta-sync', { body: { campaign_id: campaignId } })
  if (error) return { error: `Sync failed to start: ${error.message}` }

  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null }
}

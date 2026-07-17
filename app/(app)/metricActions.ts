'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type MetricState = { error: string | null; ok: boolean }

const PLATFORMS = ['meta', 'google', 'other']

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

function num(fd: FormData, k: string): number | null {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function authed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

// Shared numeric/period params from the row form.
function metricParams(fd: FormData) {
  return {
    p_platform: str(fd, 'platform') ?? 'other',
    p_period_start: str(fd, 'period_start'),
    p_period_end: str(fd, 'period_end'),
    p_spend: num(fd, 'spend'),
    p_impressions: num(fd, 'impressions'),
    p_reach: num(fd, 'reach'),
    p_clicks: num(fd, 'clicks'),
    p_results: num(fd, 'results'),
    p_note: str(fd, 'note'),
  }
}

function validate(fd: FormData): string | null {
  const platform = str(fd, 'platform')
  if (!platform || !PLATFORMS.includes(platform)) return 'Choose a platform.'
  if (!str(fd, 'period_start') || !str(fd, 'period_end')) return 'Period start and end are required.'
  return null
}

export async function addMetricAction(_prev: MetricState, fd: FormData): Promise<MetricState> {
  const supabase = await authed()
  const campaignId = str(fd, 'campaign_id')
  if (!campaignId) return { error: 'Missing campaign id.', ok: false }
  const bad = validate(fd)
  if (bad) return { error: bad, ok: false }

  const { error } = await supabase.rpc('add_campaign_metric', { p_campaign_id: campaignId, ...metricParams(fd) })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

export async function updateMetricAction(_prev: MetricState, fd: FormData): Promise<MetricState> {
  const supabase = await authed()
  const id = str(fd, 'metric_id')
  if (!id) return { error: 'Missing metric id.', ok: false }
  const bad = validate(fd)
  if (bad) return { error: bad, ok: false }

  const { error } = await supabase.rpc('update_campaign_metric', { p_id: id, ...metricParams(fd) })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  const campaignId = str(fd, 'campaign_id')
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

export async function deleteMetricAction(_prev: MetricState, fd: FormData): Promise<MetricState> {
  const supabase = await authed()
  const id = str(fd, 'metric_id')
  if (!id) return { error: 'Missing metric id.', ok: false }
  const { error } = await supabase.rpc('delete_campaign_metric', { p_id: id })
  if (error) return { error: rpcErrorMessage(error), ok: false }
  const campaignId = str(fd, 'campaign_id')
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`)
  return { error: null, ok: true }
}

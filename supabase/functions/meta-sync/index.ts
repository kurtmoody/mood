// supabase/functions/meta-sync/index.ts
//
// Pulls Meta (Facebook/Instagram) campaign insights into public.campaign_metric as daily
// source='sync' rows. Runs nightly (pg_cron + pg_net; see DEPLOY.md) and on-demand via the
// hub "Sync now" button (POST { campaign_id }).
//
// DELIVER FACTS, DON'T DECIDE POLICY. The DB owns the rules: upsert_synced_metric enforces the
// sync-only daily uniqueness (idempotent re-pull) and the manual-rows-win skip; set_campaign_
// sync_status stamps the outcome. This function only fetches from Meta, maps results, and calls
// those RPCs (as the service role). It never touches campaign_metric or campaign directly.
//
// Idempotent by construction — the daily upsert means re-runs (and overlapping windows, since
// Meta restates recent days) are always safe.
//
// --- GRAPH API VERSION PIN ---
// Pinned to v25.0 (current stable, released 2026-02-18). Meta keeps a Graph API version usable
// ~2 years past release, then removes it.
// REVIEW BY 2027-02-01: confirm v25.0 is still supported (developers.facebook.com/docs/graph-api/
// changelog) and bump if a newer stable is preferred. A removed version returns error code 2635.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected), META_SYSTEM_USER_TOKEN (secret).

import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH_VERSION = 'v25.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`
const WINDOW_DAYS = 28          // trailing pull window (Meta restates recent days)
const WRAPPED_GRACE_DAYS = 14   // keep syncing wrapped campaigns this long (late attribution)
const MAX_RETRIES = 4           // rate-limit backoff attempts

type Campaign = {
  id: string
  objective: string | null
  start_date: string | null
  meta_campaign_ids: string[]
  meta_results_action: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Europe/Malta calendar date (the flight window is Malta-based).
function maltaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Malta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

// Results mapping — which Meta action_type(s) count as a "result", by campaign objective.
// A per-campaign override (meta_results_action) wins. awareness → none (reach is its own column;
// we do NOT fake a results number). Unknown/absent objective → none.
function resultActionTypes(objective: string | null, override: string | null): string[] {
  if (override) return [override]
  switch (objective) {
    case 'leads': return ['lead']
    case 'conversions':
    case 'sales': return ['purchase', 'omni_purchase']
    case 'traffic': return ['link_click']
    default: return [] // awareness + unknown → no results
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// A daily bucket accumulated across a campaign's linked Meta IDs.
type Day = { spend: number; impressions: number; reach: number; clicks: number; results: number; hasReach: boolean; hasResults: boolean }

// Fetch one Meta campaign's daily insights. Throws Error(humanCause) on a hard failure; retries
// on rate limits with exponential backoff.
async function fetchInsights(metaId: string, since: string, until: string, token: string, resultTypes: string[]): Promise<Map<string, Day>> {
  const params = new URLSearchParams({
    time_increment: '1',
    fields: 'spend,impressions,reach,clicks,actions',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    access_token: token,
  })
  let url: string | null = `${GRAPH}/${metaId}/insights?${params.toString()}`
  const days = new Map<string, Day>()

  while (url) {
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(url)
      const payload = await res.json().catch(() => ({}))

      if (payload?.error) {
        const err = payload.error
        const code = err.code
        const rateLimited = code === 4 || code === 17 || code === 32 || code === 613 || err.error_subcode === 2446079
        if (rateLimited && attempt < MAX_RETRIES) {
          attempt++
          await sleep(1000 * 2 ** attempt) // 2s, 4s, 8s, 16s
          continue
        }
        // Human-readable cause for meta_sync_error.
        throw new Error(`Meta ${metaId}: ${err.message ?? 'request failed'}${err.code ? ` (code ${err.code})` : ''}`)
      }

      for (const row of payload.data ?? []) {
        const date = row.date_start as string
        const d = days.get(date) ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, hasReach: false, hasResults: false }
        d.spend += Number(row.spend ?? 0)
        d.impressions += Number(row.impressions ?? 0)
        // Meta is retiring the legacy reach/impression metrics through mid-2026 in favour of
        // views-based metrics. If `reach` starts coming back blank from Ads Insights, that's the
        // retirement — not a bug. We tolerate its absence: only count reach when the row actually
        // reports it (hasReach); a day with no reach at all is written as NULL (campaign_metric.
        // reach is nullable), never a fake 0.
        if (row.reach != null) { d.reach += Number(row.reach); d.hasReach = true }
        d.clicks += Number(row.clicks ?? 0)
        if (resultTypes.length > 0) {
          for (const a of row.actions ?? []) {
            if (resultTypes.includes(a.action_type)) { d.results += Number(a.value ?? 0); d.hasResults = true }
          }
        }
        days.set(date, d)
      }
      url = payload.paging?.next ?? null
      break
    }
  }
  return days
}

async function syncCampaign(supabase: any, c: Campaign, token: string, until: string): Promise<{ id: string; status: string; error?: string }> {
  const since = maxDate(c.start_date ?? addDays(until, -WINDOW_DAYS), addDays(until, -WINDOW_DAYS))
  const resultTypes = resultActionTypes(c.objective, c.meta_results_action)

  // Merge every linked Meta campaign's days.
  const merged = new Map<string, Day>()
  try {
    for (const metaId of c.meta_campaign_ids) {
      const days = await fetchInsights(metaId, since, until, token, resultTypes)
      for (const [date, d] of days) {
        const m = merged.get(date) ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, hasReach: false, hasResults: false }
        m.spend += d.spend; m.impressions += d.impressions; m.reach += d.reach; m.clicks += d.clicks
        m.results += d.results; m.hasReach = m.hasReach || d.hasReach; m.hasResults = m.hasResults || d.hasResults
        merged.set(date, m)
      }
    }
  } catch (e) {
    const cause = e instanceof Error ? e.message : 'unknown Meta error'
    await supabase.rpc('set_campaign_sync_status', { p_id: c.id, p_synced_at: null, p_error: cause })
    return { id: c.id, status: 'error', error: cause }
  }

  // Upsert each day (RPC enforces manual-rows-win + sync-day idempotency).
  let manualOverlaps = 0
  for (const [date, d] of merged) {
    const { data, error } = await supabase.rpc('upsert_synced_metric', {
      p_campaign_id: c.id,
      p_day: date,
      p_spend: d.spend,
      p_impressions: Math.round(d.impressions),
      p_reach: d.hasReach ? Math.round(d.reach) : null,
      p_clicks: Math.round(d.clicks),
      p_results: d.hasResults ? d.results : null,
    })
    if (error) {
      await supabase.rpc('set_campaign_sync_status', { p_id: c.id, p_synced_at: null, p_error: `sync write failed: ${error.message}` })
      return { id: c.id, status: 'error', error: error.message }
    }
    if (data === 'manual_overlap') manualOverlaps++
  }

  const note = manualOverlaps > 0
    ? 'manual Meta rows overlap synced dates — remove them to let sync take over'
    : null
  await supabase.rpc('set_campaign_sync_status', { p_id: c.id, p_synced_at: new Date().toISOString(), p_error: note })
  return { id: c.id, status: manualOverlaps > 0 ? 'ok_with_manual_overlap' : 'ok' }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = Deno.env.get('META_SYSTEM_USER_TOKEN')
  if (!token) {
    console.error('meta-sync: META_SYSTEM_USER_TOKEN missing — cannot sync')
    return json({ error: 'no meta token' }, 200)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const until = maltaToday()

  // Optional single-campaign run (the "Sync now" button); else the scheduled batch.
  let campaignId: string | null = null
  try { campaignId = (await req.json())?.campaign_id ?? null } catch { /* no body → scheduled */ }

  let campaigns: Campaign[]
  if (campaignId) {
    const { data } = await supabase
      .from('campaign')
      .select('id, objective, start_date, meta_campaign_ids, meta_results_action')
      .eq('id', campaignId)
      .maybeSingle()
    campaigns = data && (data as Campaign).meta_campaign_ids?.length ? [data as Campaign] : []
  } else {
    // Non-empty links, and either active-ish or recently wrapped (late-arriving attribution).
    const graceStart = addDays(until, -WRAPPED_GRACE_DAYS)
    const { data } = await supabase
      .from('campaign')
      .select('id, objective, start_date, end_date, meta_campaign_ids, meta_results_action, phase')
      .not('meta_campaign_ids', 'eq', '{}')
    campaigns = ((data as any[]) ?? []).filter((c) =>
      c.meta_campaign_ids?.length &&
      (c.phase === 'production' || c.phase === 'live' || (c.phase === 'wrapped' && c.end_date && c.end_date >= graceStart)),
    )
  }

  if (campaigns.length === 0) return json({ synced: 0, message: campaignId ? 'campaign not linked to Meta' : 'no campaigns to sync' })

  const results: { id: string; status: string; error?: string }[] = []
  for (const c of campaigns) results.push(await syncCampaign(supabase, c, token, until))

  // Token-level failure: every campaign errored the same way → the token/app is the likely cause.
  const errored = results.filter((r) => r.status === 'error')
  if (errored.length === results.length && results.length > 1) {
    console.error(`meta-sync: ALL ${results.length} campaigns failed — likely a token/app problem: ${errored[0].error}`)
  }
  console.log(`meta-sync: processed ${results.length} campaign(s); ${errored.length} error(s)`)

  return json({ synced: results.length, errors: errored.length, results })
})

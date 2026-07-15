// Campaign vocab (0056). Agency-internal in this slice — no client-facing labels.

export const CAMPAIGN_OBJECTIVES = ['awareness', 'traffic', 'leads', 'conversions', 'sales'] as const
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number]

export const OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  awareness: 'Awareness',
  traffic: 'Traffic',
  leads: 'Leads',
  conversions: 'Conversions',
  sales: 'Sales',
}

// The lifecycle, in advancing order — the hub's phase-advance control steps through this.
export const CAMPAIGN_PHASES = ['planning', 'production', 'live', 'wrapped', 'closed'] as const
export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number]

export const PHASE_LABEL: Record<CampaignPhase, string> = {
  planning: 'Planning',
  production: 'Production',
  live: 'Live',
  wrapped: 'Wrapped',
  closed: 'Closed',
}

// The next phase in the lifecycle, or null when already closed.
export function nextPhase(phase: string): CampaignPhase | null {
  const i = CAMPAIGN_PHASES.indexOf(phase as CampaignPhase)
  if (i < 0 || i >= CAMPAIGN_PHASES.length - 1) return null
  return CAMPAIGN_PHASES[i + 1]
}

// The unit a KPI counts, keyed by objective, so a target reads naturally ("leads", "sales").
const RESULT_UNIT: Record<CampaignObjective, string> = {
  awareness: 'view',
  traffic: 'click',
  leads: 'lead',
  conversions: 'conversion',
  sales: 'sale',
}

// One-line KPI target, e.g. "200 leads · ≤ €20/lead". Null when no target is set.
export function kpiLine(
  results: number | null,
  costPerResult: number | null,
  objective: string | null,
): string | null {
  const unit = RESULT_UNIT[objective as CampaignObjective] ?? 'result'
  const parts: string[] = []
  if (results != null) parts.push(`${results} ${unit}${results === 1 ? '' : 's'}`)
  if (costPerResult != null) parts.push(`≤ €${costPerResult}/${unit}`)
  return parts.length ? parts.join(' · ') : null
}

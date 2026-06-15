// Single source of truth for client deliverable cadences (migration 0051).
// CADENCES must match the client_deliverable.cadence CHECK exactly.

export const CADENCES = ['per_week', 'per_month', 'per_quarter', 'per_year', 'one_off', 'ongoing'] as const
export type Cadence = (typeof CADENCES)[number]

// How a cadence reads next to a quantity, e.g. "12 / month", "Ongoing", "1 one-off".
export const CADENCE_LABEL: Record<Cadence, string> = {
  per_week: '/ week',
  per_month: '/ month',
  per_quarter: '/ quarter',
  per_year: '/ year',
  one_off: 'one-off',
  ongoing: 'Ongoing',
}

// Options for the <select> — same source of truth as the display labels above.
export const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'per_week', label: 'Per week' },
  { value: 'per_month', label: 'Per month' },
  { value: 'per_quarter', label: 'Per quarter' },
  { value: 'per_year', label: 'Per year' },
  { value: 'one_off', label: 'One-off' },
  { value: 'ongoing', label: 'Ongoing' },
]

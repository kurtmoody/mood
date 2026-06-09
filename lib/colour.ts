// Per-client colours for the combined calendar. A client's colour is its stored
// brand_colour, or a stable fallback from this palette, so nothing renders colourless.

export const CLIENT_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#06B6D4', '#A855F7',
]

// Deterministic hash → palette index, so a given seed always maps to the same colour.
function hashIndex(seed: string, mod: number) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return mod ? h % mod : 0
}

export function fallbackColour(seed: string) {
  return CLIENT_PALETTE[hashIndex(seed, CLIENT_PALETTE.length)]
}

// A client's calendar colour: its calendar_colour if set, else a stable palette fallback.
export function clientColour(c: { id: string; calendar_colour?: string | null }) {
  const b = c.calendar_colour?.trim()
  return b ? b : fallbackColour(c.id)
}

// Readable text colour (#fff or near-black) for a hex background, by relative luminance.
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#15171C'
  const n = m[1]
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.55 ? '#15171C' : '#FFFFFF'
}

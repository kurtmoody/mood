// Shared control styling — the single source of truth for buttons and form fields.
// Compose extras with template strings: className={`${btnPrimary} w-full`}.
// Sm variants are for dense contexts (inline editors, table rows).

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 bg-ink text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-black disabled:opacity-50 cursor-pointer'
export const btnPrimarySm =
  'inline-flex items-center justify-center gap-1.5 bg-ink text-white rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-black disabled:opacity-50 cursor-pointer'
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 border border-line-strong text-muted rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-hover hover:text-ink disabled:opacity-50 cursor-pointer'
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 text-muted rounded-lg px-3 py-2 text-sm hover:bg-hover hover:text-ink disabled:opacity-50 cursor-pointer'
export const btnDanger =
  'inline-flex items-center justify-center gap-1.5 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer'
export const btnDangerOutline =
  'inline-flex items-center justify-center gap-1.5 border border-accent text-accent rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-accent/5 disabled:opacity-50 cursor-pointer'

export const labelCls = 'block text-[11px] uppercase tracking-wide text-faint font-semibold mb-1'
export const fieldCls = 'w-full border border-line-strong rounded-lg px-3 py-2 text-sm bg-white'
export const fieldClsSm = 'w-full border border-line-strong rounded-lg px-2.5 py-1.5 text-sm bg-white'

// View-agnostic column-preference mechanism. A view declares its columns (key, label,
// and whether the user may hide it); the saved preference stores order + hidden flags;
// mergeColumns reconciles the two so the table renders correctly even as columns change.

// lockable=false → the user CANNOT hide this column (e.g. an identifier like task title).
export type ColumnDef = { key: string; label: string; lockable: boolean }

// What we persist (per view_key): an ordered list of {key, hidden}.
export type ColumnConfig = { key: string; hidden: boolean }

export type ResolvedColumn = ColumnDef & { hidden: boolean }

// Merge a saved config with the current column set.
//  - honour the saved ORDER, then append any columns the user has never seen (new
//    columns added later) at the end, default VISIBLE — so adding a column doesn't
//    silently hide it for existing users.
//  - drop saved keys that no longer exist.
//  - non-lockable columns are always visible regardless of what was saved.
export function mergeColumns(
  columns: ColumnDef[],
  saved: ColumnConfig[] | null | undefined,
): ResolvedColumn[] {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const seen = new Set<string>()
  const out: ResolvedColumn[] = []

  for (const s of saved ?? []) {
    const def = byKey.get(s.key)
    if (!def || seen.has(s.key)) continue
    seen.add(s.key)
    out.push({ ...def, hidden: def.lockable ? !!s.hidden : false })
  }
  for (const c of columns) {
    if (seen.has(c.key)) continue
    out.push({ ...c, hidden: false })
  }
  return out
}

export function toConfig(resolved: ResolvedColumn[]): ColumnConfig[] {
  return resolved.map((c) => ({ key: c.key, hidden: c.hidden }))
}

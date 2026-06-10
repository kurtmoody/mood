'use server'

import { createClient } from '@/lib/supabase/server'
import type { ColumnConfig } from '@/lib/viewColumns'

// Persist the caller's own column preference for a view. View-agnostic: pass any
// view_key. No revalidate — the client already holds the new state.
export async function setViewPreferenceAction(
  viewKey: string,
  config: ColumnConfig[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('set_view_preference', {
    p_view_key: viewKey,
    p_config: config,
  })
  return { error: error?.message ?? null }
}

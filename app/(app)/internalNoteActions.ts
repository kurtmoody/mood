'use server'

import { createClient } from '@/lib/supabase/server'

// Internal notes (agency-only, polymorphic over post/task). Direct-call actions; the
// RPCs enforce all authorisation. No revalidate — the component refetches itself.

export async function addInternalNoteAction(
  parentType: 'post' | 'task',
  parentId: string,
  body: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!body.trim()) return { error: 'Note cannot be empty.' }

  const { error } = await supabase.rpc('add_internal_note', {
    p_parent_type: parentType,
    p_parent_id: parentId,
    p_body: body,
  })
  return { error: error?.message ?? null }
}

export async function updateInternalNoteAction(
  id: string,
  body: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!body.trim()) return { error: 'Note cannot be empty.' }

  const { error } = await supabase.rpc('update_internal_note', { p_id: id, p_body: body })
  return { error: error?.message ?? null }
}

export async function deleteInternalNoteAction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.rpc('delete_internal_note', { p_id: id })
  return { error: error?.message ?? null }
}

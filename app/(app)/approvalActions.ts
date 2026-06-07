'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type TransitionState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

export async function transitionPostAction(_prev: TransitionState, fd: FormData): Promise<TransitionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const itemId = str(fd, 'item_id')
  const action = str(fd, 'action')
  if (!itemId || !action) return { error: 'Missing action.', ok: false }

  const note = str(fd, 'note')
  if (action === 'request_changes' && !note) {
    return { error: 'A note is required when requesting changes.', ok: false }
  }

  const { error } = await supabase.rpc('transition_post', {
    p_item_id: itemId,
    p_action: action,
    p_note: note,
  })
  if (error) return { error: error.message, ok: false }

  revalidatePath('/')
  return { error: null, ok: true }
}

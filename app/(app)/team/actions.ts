'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type FormState = { error: string | null; ok: boolean }

export async function addTeamMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim() ?? ''
    return v === '' ? null : v
  }

  const fullName = str('full_name')
  if (!fullName) return { error: 'Full name is required.', ok: false }

  // RPC derives the agency from membership and inserts as SECURITY DEFINER.
  const { error } = await supabase.rpc('add_team_member', {
    p_full_name: fullName,
    p_role: str('role'),
    p_email: str('email'),
  })

  if (error) return { error: error.message, ok: false }

  revalidatePath('/team')
  return { error: null, ok: true }
}

export async function updateTeamMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim() ?? ''
    return v === '' ? null : v
  }

  const id = str('id')
  if (!id) return { error: 'Missing member id.', ok: false }

  const fullName = str('full_name')
  if (!fullName) return { error: 'Full name is required.', ok: false }

  const { error } = await supabase.rpc('update_team_member', {
    p_id: id,
    p_full_name: fullName,
    p_role: str('role'),
    p_email: str('email'),
    p_is_active: formData.get('is_active') === 'true',
  })

  if (error) return { error: error.message, ok: false }

  revalidatePath('/team')
  return { error: null, ok: true }
}

export async function setTeamMemberActiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = (formData.get('id') as string | null)?.trim()
  if (!id) return { error: 'Missing member id.', ok: false }

  const { error } = await supabase.rpc('set_team_member_active', {
    p_id: id,
    p_is_active: formData.get('is_active') === 'true',
  })

  if (error) return { error: error.message, ok: false }

  revalidatePath('/team')
  return { error: null, ok: true }
}

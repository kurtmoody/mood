'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type InviteState = { error: string | null; ok: boolean }

// Create an agency or client invite. Scope + role come from the form; the RPC
// enforces admin-only auth, the scope/role combo, and ownership of the scope.
export async function createInviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email = (formData.get('email') as string | null)?.trim().toLowerCase() ?? ''
  if (!email) return { error: 'Email is required.', ok: false }

  const scopeType = formData.get('scope_type') as string
  const scopeId = formData.get('scope_id') as string
  const role = (formData.get('role') as string) || (scopeType === 'agency' ? 'agency_member' : 'client_viewer')

  const { error } = await supabase.rpc('create_invite', {
    p_email: email,
    p_scope_type: scopeType,
    p_scope_id: scopeId,
    p_role: role,
  })
  if (error) return { error: error.message, ok: false }

  const revalidate = formData.get('revalidate') as string | null
  if (revalidate) revalidatePath(revalidate)
  return { error: null, ok: true }
}

export async function revokeInviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = (formData.get('id') as string | null)?.trim()
  if (!id) return { error: 'Missing invite id.', ok: false }

  const { error } = await supabase.rpc('revoke_invite', { p_id: id })
  if (error) return { error: error.message, ok: false }

  const revalidate = formData.get('revalidate') as string | null
  if (revalidate) revalidatePath(revalidate)
  return { error: null, ok: true }
}

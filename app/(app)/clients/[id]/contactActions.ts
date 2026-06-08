'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ContactState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

async function authedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

export async function setPortalAccessAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const contactId = str(fd, 'contact_id')
  if (!contactId) return { error: 'Missing contact id.', ok: false }
  const enabled = fd.get('enabled') === 'true'

  const { error } = await supabase.rpc('set_contact_portal_access', {
    p_contact_id: contactId,
    p_enabled: enabled,
  })
  if (error) return { error: error.message, ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function addContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }
  const firstName = str(fd, 'first_name')
  if (!firstName) return { error: 'First name is required.', ok: false }

  const { error } = await supabase.rpc('add_contact', {
    p_client_id: clientId,
    p_first_name: firstName,
    p_surname: str(fd, 'surname'),
    p_role: str(fd, 'role'),
    p_email: str(fd, 'email'),
    p_phone: str(fd, 'phone'),
    p_is_primary: fd.get('is_primary') === 'on',
  })
  if (error) return { error: error.message, ok: false }

  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function updateContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const contactId = str(fd, 'contact_id')
  if (!contactId) return { error: 'Missing contact id.', ok: false }
  const firstName = str(fd, 'first_name')
  if (!firstName) return { error: 'First name is required.', ok: false }

  const { error } = await supabase.rpc('update_contact', {
    p_contact_id: contactId,
    p_first_name: firstName,
    p_surname: str(fd, 'surname'),
    p_role: str(fd, 'role'),
    p_email: str(fd, 'email'),
    p_phone: str(fd, 'phone'),
    p_is_primary: fd.get('is_primary') === 'on',
  })
  if (error) return { error: error.message, ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function deleteContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const contactId = str(fd, 'contact_id')
  if (!contactId) return { error: 'Missing contact id.', ok: false }

  const { error } = await supabase.rpc('delete_contact', { p_contact_id: contactId })
  if (error) return { error: error.message, ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

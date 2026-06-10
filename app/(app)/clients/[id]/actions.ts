'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type FormState = { error: string | null; ok: boolean }

export async function updateClientAction(
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

  const clientId = str('client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }

  const name = str('name')
  if (!name) return { error: 'Name is required.', ok: false }

  const retainerRaw = str('retainer_amount')
  let retainer: number | null = null
  if (retainerRaw !== null) {
    retainer = Number(retainerRaw)
    if (Number.isNaN(retainer)) return { error: 'Retainer must be a number.', ok: false }
  }

  // Atomic update of client + client_internal as SECURITY DEFINER (migration 0006).
  const { error } = await supabase.rpc('update_client', {
    p_client_id: clientId,
    p_name: name,
    p_status: str('status') ?? 'active',
    p_website: str('website'),
    p_industry: str('industry'),
    p_timezone: str('timezone') ?? 'Europe/Malta',
    p_brand_colour: str('brand_colour'),
    p_calendar_colour: str('calendar_colour'),
    p_account_owner_id: str('account_owner_id'),
    p_notes: str('notes'),
    p_billing_email: str('billing_email'),
    p_vat_number: str('vat_number'),
    p_billing_address: str('billing_address'),
    p_payment_terms: str('payment_terms'),
    p_currency: str('currency') ?? 'EUR',
    p_retainer_amount: retainer,
  })

  if (error) return { error: error.message, ok: false }

  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

// Permanent (hard) delete of a client and all its dependent data. Admin-only +
// two-step (must be paused/archived) enforced inside the RPC. Redirects to the list.
export async function deleteClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = (formData.get('client_id') as string | null)?.trim()
  if (!clientId) return { error: 'Missing client id.', ok: false }

  const { error } = await supabase.rpc('delete_client', { p_id: clientId })
  if (error) return { error: error.message, ok: false }

  revalidatePath('/clients')
  redirect('/clients')
}

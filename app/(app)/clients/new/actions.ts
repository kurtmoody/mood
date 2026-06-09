'use server'

import { createClient } from '@/lib/supabase/server'
import { fallbackColour } from '@/lib/colour'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type FormState = { error: string | null }

export async function createClientAction(
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

  const name = str('name')
  if (!name) return { error: 'Name is required.' }

  const retainerRaw = str('retainer_amount')
  let retainer: number | null = null
  if (retainerRaw !== null) {
    retainer = Number(retainerRaw)
    if (Number.isNaN(retainer)) return { error: 'Retainer must be a number.' }
  }

  // Atomic create: the RPC derives the agency from membership and inserts
  // both client + client_internal as SECURITY DEFINER (see migration 0004).
  const { error } = await supabase.rpc('create_client', {
    p_name: name,
    p_status: str('status') ?? 'active',
    p_website: str('website'),
    p_industry: str('industry'),
    p_timezone: str('timezone') ?? 'Europe/Malta',
    p_brand_colour: str('brand_colour'),
    p_calendar_colour: str('calendar_colour') ?? fallbackColour(name), // never null on new clients
    p_notes: str('notes'),
    p_billing_email: str('billing_email'),
    p_vat_number: str('vat_number'),
    p_billing_address: str('billing_address'),
    p_payment_terms: str('payment_terms'),
    p_currency: str('currency') ?? 'EUR',
    p_retainer_amount: retainer,
  })

  if (error) return { error: error.message }

  revalidatePath('/clients')
  redirect('/clients')
}

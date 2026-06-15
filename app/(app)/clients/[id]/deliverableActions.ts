'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { CADENCES, type Cadence } from '@/lib/deliverableConstants'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type DeliverableState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

function num(fd: FormData, k: string): number | null {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function cadence(fd: FormData): { value: string | null; valid: boolean } {
  const v = str(fd, 'cadence')
  return { value: v, valid: v === null || CADENCES.includes(v as Cadence) }
}

async function authedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

export async function addDeliverableAction(_prev: DeliverableState, fd: FormData): Promise<DeliverableState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }
  const label = str(fd, 'label')
  if (!label) return { error: 'Label is required.', ok: false }
  const cad = cadence(fd)
  if (!cad.valid) return { error: 'Choose a valid cadence.', ok: false }

  const { error } = await supabase.rpc('add_client_deliverable', {
    p_client_id: clientId,
    p_label: label,
    p_quantity: num(fd, 'quantity'),
    p_cadence: cad.value,
    p_notes: str(fd, 'notes'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function updateDeliverableAction(_prev: DeliverableState, fd: FormData): Promise<DeliverableState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const deliverableId = str(fd, 'deliverable_id')
  if (!deliverableId) return { error: 'Missing deliverable id.', ok: false }
  const label = str(fd, 'label')
  if (!label) return { error: 'Label is required.', ok: false }
  const cad = cadence(fd)
  if (!cad.valid) return { error: 'Choose a valid cadence.', ok: false }

  const { error } = await supabase.rpc('update_client_deliverable', {
    p_id: deliverableId,
    p_label: label,
    p_quantity: num(fd, 'quantity'),
    p_cadence: cad.value,
    p_notes: str(fd, 'notes'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function deleteDeliverableAction(_prev: DeliverableState, fd: FormData): Promise<DeliverableState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const deliverableId = str(fd, 'deliverable_id')
  if (!deliverableId) return { error: 'Missing deliverable id.', ok: false }

  const { error } = await supabase.rpc('delete_client_deliverable', { p_id: deliverableId })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

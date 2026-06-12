'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type BrandAssetState = { error: string | null; ok: boolean }

const KINDS = ['logo', 'colour', 'font', 'guideline', 'other']

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

export async function addBrandAssetAction(_prev: BrandAssetState, fd: FormData): Promise<BrandAssetState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  if (!clientId) return { error: 'Missing client id.', ok: false }
  const kind = str(fd, 'kind')
  if (!kind || !KINDS.includes(kind)) return { error: 'Choose a valid kind.', ok: false }

  const { error } = await supabase.rpc('add_brand_asset', {
    p_client_id: clientId,
    p_kind: kind,
    p_label: str(fd, 'label'),
    p_value: str(fd, 'value'),
    p_notes: str(fd, 'notes'),
  })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

export async function deleteBrandAssetAction(_prev: BrandAssetState, fd: FormData): Promise<BrandAssetState> {
  const supabase = await authedClient()
  const clientId = str(fd, 'client_id')
  const assetId = str(fd, 'asset_id')
  if (!assetId) return { error: 'Missing asset id.', ok: false }

  const { error } = await supabase.rpc('delete_brand_asset', { p_asset_id: assetId })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { error: null, ok: true }
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditClientForm from './EditClientForm'
import ChannelsSection, { type Channel } from './ChannelsSection'
import ContactsSection, { type Contact } from './ContactsSection'
import BrandAssetsSection, { type BrandAsset } from './BrandAssetsSection'
import type { ClientDefaults, TeamOption } from '../ClientFormFields'

type Internal = {
  account_owner_id: string | null
  notes: string | null
  billing_email: string | null
  vat_number: string | null
  billing_address: string | null
  payment_terms: string | null
  currency: string | null
  retainer_amount: number | null
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agencyMemberships } = await supabase
    .from('membership')
    .select('scope_id')
    .eq('scope_type', 'agency')
  if (!agencyMemberships?.length) redirect('/')

  const { data: client } = await supabase
    .from('client')
    .select('id, name, status, website, industry, timezone, brand_colour, client_internal ( account_owner_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount )')
    .eq('id', id)
    .maybeSingle()

  if (!client) redirect('/clients')

  const ciRaw = (client as { client_internal: Internal | Internal[] | null }).client_internal
  const ci = (Array.isArray(ciRaw) ? ciRaw[0] : ciRaw) ?? null

  const { data: team } = await supabase
    .from('team_member')
    .select('id, full_name')
    .order('full_name')

  const { data: channels } = await supabase
    .from('channel')
    .select('id, type, label')
    .eq('client_id', id)
    .order('type')

  const { data: contacts } = await supabase
    .from('client_contact')
    .select('id, first_name, surname, role, email, phone, is_primary')
    .eq('client_id', id)
    .order('is_primary', { ascending: false })
    .order('first_name')

  const { data: assets } = await supabase
    .from('brand_asset')
    .select('id, kind, label, value, notes')
    .eq('client_id', id)
    .order('kind')

  const defaults: ClientDefaults = {
    name: client.name,
    status: client.status,
    website: client.website,
    industry: client.industry,
    timezone: client.timezone,
    brand_colour: client.brand_colour,
    account_owner_id: ci?.account_owner_id ?? null,
    notes: ci?.notes ?? null,
    billing_email: ci?.billing_email ?? null,
    vat_number: ci?.vat_number ?? null,
    billing_address: ci?.billing_address ?? null,
    payment_terms: ci?.payment_terms ?? null,
    currency: ci?.currency ?? null,
    retainer_amount: ci?.retainer_amount ?? null,
  }

  return (
    <>
      <div className="mb-5">
        <div className="text-xl font-bold">{client.name}</div>
        <div className="text-sm text-[#5A5E66]">Edit client</div>
      </div>
      <EditClientForm clientId={client.id} defaults={defaults} teamMembers={(team as TeamOption[] | null) ?? []} />

      <div className="max-w-[680px] mt-10">
        <ChannelsSection clientId={client.id} channels={(channels as Channel[] | null) ?? []} />
      </div>

      <div className="max-w-[680px] mt-10">
        <ContactsSection clientId={client.id} contacts={(contacts as Contact[] | null) ?? []} />
      </div>

      <div className="max-w-[680px] mt-10">
        <BrandAssetsSection clientId={client.id} assets={(assets as BrandAsset[] | null) ?? []} />
      </div>
    </>
  )
}

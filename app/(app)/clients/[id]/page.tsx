import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditClientForm from './EditClientForm'
import ChannelsSection, { type Channel } from './ChannelsSection'
import ContactsSection, { type Contact } from './ContactsSection'
import BrandAssetsSection, { type BrandAsset } from './BrandAssetsSection'
import OwnershipSection from './OwnershipSection'
import DeleteClientSection from './DeleteClientSection'
import TimesheetEnableToggle from './TimesheetEnableToggle'
import TimesheetSection from '@/components/TimesheetSection'
import PageContainer from '@/components/PageContainer'
import InvitePanel, { type Invite } from '../../InvitePanel'
import type { ClientDefaults, TeamOption } from '../ClientFormFields'
import type { Ownership } from '@/lib/ownershipRoles'

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

  const [{ data: { user } }, { data: agencyMemberships }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('membership').select('scope_id, role').eq('scope_type', 'agency'),
  ])
  if (!user) redirect('/login')
  if (!agencyMemberships?.length) redirect('/')
  const isAdmin = agencyMemberships.some((m) => m.role === 'agency_admin')

  // Everything below only needs the route id — fetch in one parallel round.
  const [
    { data: client },
    { data: team },
    { data: channels },
    { data: contacts },
    { data: assets },
    { data: ownership },
    { data: invites },
  ] = await Promise.all([
    supabase
      .from('client')
      .select('id, name, status, website, industry, timezone, brand_colour, calendar_colour, timesheet_enabled, client_internal ( account_owner_id, notes, billing_email, vat_number, billing_address, payment_terms, currency, retainer_amount )')
      .eq('id', id)
      .maybeSingle(),
    // Assignment dropdowns (account owner + ownership roles) — active members only.
    supabase.from('team_member').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('channel').select('id, type, label').eq('client_id', id).order('type'),
    supabase
      .from('client_contact')
      .select('id, first_name, surname, role, email, phone, is_primary, portal_access')
      .eq('client_id', id)
      .order('is_primary', { ascending: false })
      .order('first_name'),
    supabase.from('brand_asset').select('id, kind, label, value, notes').eq('client_id', id).order('kind'),
    supabase
      .from('client_ownership')
      .select('lead_pm_id, comms_backup_id, creative_lead_id, design_owner_id, content_owner_id, video_owner_id, sales_ops_id, intern_support_id')
      .eq('client_id', id)
      .maybeSingle(),
    supabase
      .from('invite')
      .select('id, email, role, created_at, expires_at')
      .eq('scope_type', 'client')
      .eq('scope_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  if (!client) redirect('/clients')

  const ciRaw = (client as { client_internal: Internal | Internal[] | null }).client_internal
  const ci = (Array.isArray(ciRaw) ? ciRaw[0] : ciRaw) ?? null

  const defaults: ClientDefaults = {
    name: client.name,
    status: client.status,
    website: client.website,
    industry: client.industry,
    timezone: client.timezone,
    brand_colour: client.brand_colour,
    calendar_colour: client.calendar_colour,
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
    <PageContainer variant="narrow">
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

      <div className="max-w-[680px] mt-10">
        <OwnershipSection
          clientId={client.id}
          ownership={(ownership as Ownership | null) ?? null}
          teamMembers={(team as TeamOption[] | null) ?? []}
        />
      </div>

      <div className="max-w-[680px] mt-10">
        <InvitePanel
          scopeType="client"
          scopeId={client.id}
          revalidate={`/clients/${client.id}`}
          invites={(invites as Invite[] | null) ?? []}
        />
      </div>

      <div className="max-w-[680px] mt-10 flex flex-col gap-4">
        {isAdmin && <TimesheetEnableToggle clientId={client.id} enabled={!!(client as { timesheet_enabled?: boolean }).timesheet_enabled} />}
        {(client as { timesheet_enabled?: boolean }).timesheet_enabled && (
          <TimesheetSection clientId={client.id} currentUserId={user.id} />
        )}
      </div>

      {isAdmin && client.status === 'archived' && (
        <div className="max-w-[680px] mt-10">
          <DeleteClientSection clientId={client.id} clientName={client.name} />
        </div>
      )}
    </PageContainer>
  )
}

import type { ReactNode } from 'react'
import ColourPicker from '@/components/ColourPicker'
import { labelCls, fieldCls } from '@/components/ui'

export type ClientDefaults = {
  name?: string | null
  status?: string | null
  website?: string | null
  industry?: string | null
  timezone?: string | null
  brand_colour?: string | null
  calendar_colour?: string | null
  account_owner_id?: string | null
  notes?: string | null
  billing_email?: string | null
  vat_number?: string | null
  billing_address?: string | null
  payment_terms?: string | null
  currency?: string | null
  retainer_amount?: number | null
}

export type TeamOption = { id: string; full_name: string }

function Field({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

export default function ClientFormFields({
  defaults,
  teamMembers,
}: {
  defaults?: ClientDefaults
  teamMembers?: TeamOption[]
}) {
  const d = defaults ?? {}

  return (
    <>
      <section className="border border-[#ECECEE] rounded-2xl bg-white p-5">
        <div className="text-sm font-semibold mb-4">Details</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Name *" name="name">
              <input id="name" name="name" required defaultValue={d.name ?? ''} className={fieldCls} placeholder="Acme Ltd" />
            </Field>
          </div>
          <Field label="Status" name="status">
            <select id="status" name="status" defaultValue={d.status ?? 'active'} className={fieldCls}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Industry" name="industry">
            <input id="industry" name="industry" defaultValue={d.industry ?? ''} className={fieldCls} placeholder="Hospitality" />
          </Field>
          <Field label="Website" name="website">
            <input id="website" name="website" type="url" defaultValue={d.website ?? ''} className={fieldCls} placeholder="https://…" />
          </Field>
          <Field label="Brand colour" name="brand_colour">
            <input id="brand_colour" name="brand_colour" defaultValue={d.brand_colour ?? ''} className={fieldCls} placeholder="#15171C" />
          </Field>
          <Field label="Calendar colour" name="calendar_colour">
            <ColourPicker name="calendar_colour" defaultValue={d.calendar_colour} />
          </Field>
          <Field label="Timezone" name="timezone">
            <input id="timezone" name="timezone" defaultValue={d.timezone ?? 'Europe/Malta'} className={fieldCls} />
          </Field>
          {teamMembers && (
            <Field label="Account owner" name="account_owner_id">
              <select id="account_owner_id" name="account_owner_id" defaultValue={d.account_owner_id ?? ''} className={fieldCls}>
                <option value="">— none —</option>
                {teamMembers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </section>

      <section className="border border-[#ECECEE] rounded-2xl bg-white p-5">
        <div className="text-sm font-semibold mb-1">Billing &amp; internal</div>
        <div className="text-xs text-[#9398A1] mb-4">Agency-only — never shown to clients.</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Billing email" name="billing_email">
            <input id="billing_email" name="billing_email" type="email" defaultValue={d.billing_email ?? ''} className={fieldCls} placeholder="accounts@…" />
          </Field>
          <Field label="VAT number" name="vat_number">
            <input id="vat_number" name="vat_number" defaultValue={d.vat_number ?? ''} className={fieldCls} />
          </Field>
          <Field label="Payment terms" name="payment_terms">
            <input id="payment_terms" name="payment_terms" defaultValue={d.payment_terms ?? ''} className={fieldCls} placeholder="30 days" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency" name="currency">
              <input id="currency" name="currency" defaultValue={d.currency ?? 'EUR'} className={fieldCls} />
            </Field>
            <Field label="Retainer" name="retainer_amount">
              <input id="retainer_amount" name="retainer_amount" type="number" step="0.01" min="0" defaultValue={d.retainer_amount ?? ''} className={fieldCls} placeholder="0.00" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Billing address" name="billing_address">
              <textarea id="billing_address" name="billing_address" rows={2} defaultValue={d.billing_address ?? ''} className={fieldCls} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes" name="notes">
              <textarea id="notes" name="notes" rows={3} defaultValue={d.notes ?? ''} className={fieldCls} />
            </Field>
          </div>
        </div>
      </section>
    </>
  )
}

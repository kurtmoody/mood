'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createClientAction, type FormState } from './actions'

const initial: FormState = { error: null }

const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white'

function Field({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

export default function NewClientForm() {
  const [state, action, pending] = useActionState(createClientAction, initial)

  return (
    <form action={action} className="flex flex-col gap-5 max-w-[680px]">
      <section className="border border-[#ECECEE] rounded-2xl bg-white p-5">
        <div className="text-sm font-semibold mb-4">Details</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Name *" name="name">
              <input id="name" name="name" required className={fieldCls} placeholder="Acme Ltd" />
            </Field>
          </div>
          <Field label="Status" name="status">
            <select id="status" name="status" defaultValue="active" className={fieldCls}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Industry" name="industry">
            <input id="industry" name="industry" className={fieldCls} placeholder="Hospitality" />
          </Field>
          <Field label="Website" name="website">
            <input id="website" name="website" type="url" className={fieldCls} placeholder="https://…" />
          </Field>
          <Field label="Brand colour" name="brand_colour">
            <input id="brand_colour" name="brand_colour" className={fieldCls} placeholder="#15171C" />
          </Field>
          <Field label="Timezone" name="timezone">
            <input id="timezone" name="timezone" defaultValue="Europe/Malta" className={fieldCls} />
          </Field>
        </div>
      </section>

      <section className="border border-[#ECECEE] rounded-2xl bg-white p-5">
        <div className="text-sm font-semibold mb-1">Billing &amp; internal</div>
        <div className="text-xs text-[#9398A1] mb-4">Agency-only — never shown to clients.</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Billing email" name="billing_email">
            <input id="billing_email" name="billing_email" type="email" className={fieldCls} placeholder="accounts@…" />
          </Field>
          <Field label="VAT number" name="vat_number">
            <input id="vat_number" name="vat_number" className={fieldCls} />
          </Field>
          <Field label="Payment terms" name="payment_terms">
            <input id="payment_terms" name="payment_terms" className={fieldCls} placeholder="30 days" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency" name="currency">
              <input id="currency" name="currency" defaultValue="EUR" className={fieldCls} />
            </Field>
            <Field label="Retainer" name="retainer_amount">
              <input id="retainer_amount" name="retainer_amount" type="number" step="0.01" min="0" className={fieldCls} placeholder="0.00" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Billing address" name="billing_address">
              <textarea id="billing_address" name="billing_address" rows={2} className={fieldCls} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes" name="notes">
              <textarea id="notes" name="notes" rows={3} className={fieldCls} />
            </Field>
          </div>
        </div>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-[#15171C] text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Create client'}
        </button>
        <Link href="/clients" className="text-sm text-[#5A5E66] rounded-lg px-3 py-2.5 hover:bg-[#F4F4F6]">
          Cancel
        </Link>
      </div>
    </form>
  )
}

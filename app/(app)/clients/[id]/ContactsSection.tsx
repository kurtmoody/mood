'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  addContactAction,
  updateContactAction,
  deleteContactAction,
  setPortalAccessAction,
  type ContactState,
} from './contactActions'

export type Contact = {
  id: string
  first_name: string | null
  surname: string | null
  role: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  portal_access: boolean
}

const initial: ContactState = { error: null, ok: false }
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white'
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'

function fullName(c: Contact) {
  return [c.first_name, c.surname].filter(Boolean).join(' ') || '—'
}

function ContactFields({ c }: { c?: Contact }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>First name *</label>
        <input name="first_name" required defaultValue={c?.first_name ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Surname</label>
        <input name="surname" defaultValue={c?.surname ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Role</label>
        <input name="role" defaultValue={c?.role ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <input name="email" type="email" defaultValue={c?.email ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Phone</label>
        <input name="phone" defaultValue={c?.phone ?? ''} className={fieldCls} />
      </div>
      <label className="flex items-center gap-2 text-sm self-end pb-2">
        <input type="checkbox" name="is_primary" defaultChecked={c?.is_primary ?? false} />
        Set as primary
      </label>
    </div>
  )
}

function AddContactForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addContactAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add contact</div>
      <input type="hidden" name="client_id" value={clientId} />
      <ContactFields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add contact'}
        </button>
      </div>
    </form>
  )
}

function EditContactForm({ contact, clientId, onDone }: { contact: Contact; clientId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateContactAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="px-5 py-4 border-b border-[#ECECEE] last:border-b-0 bg-[#FBFBFC]">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="contact_id" value={contact.id} />
      <ContactFields c={contact} />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-[#5A5E66] rounded-lg px-3 py-2 hover:bg-[#F4F4F6]">
          Cancel
        </button>
      </div>
    </form>
  )
}

function DeleteContactButton({ contactId, clientId }: { contactId: string; clientId: string }) {
  const [state, action, pending] = useActionState(deleteContactAction, initial)
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm('Delete this contact?')) e.preventDefault() }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="contact_id" value={contactId} />
      <button type="submit" disabled={pending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">
        Delete
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function PortalAccessButton({ contact, clientId }: { contact: Contact; clientId: string }) {
  const [state, action, pending] = useActionState(setPortalAccessAction, initial)

  // Portal login matches the contact's email — can't invite without one.
  if (!contact.email && !contact.portal_access) {
    return <span className="text-sm text-[#9398A1]" title="Add an email before inviting">Email required</span>
  }

  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="contact_id" value={contact.id} />
      <input type="hidden" name="enabled" value={contact.portal_access ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={pending}
        className={`text-sm hover:underline disabled:opacity-50 ${contact.portal_access ? 'text-[#5A5E66]' : 'text-[#15171C] font-medium'}`}
      >
        {pending ? '…' : contact.portal_access ? 'Revoke access' : 'Invite to portal'}
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function ContactRow({ contact, clientId }: { contact: Contact; clientId: string }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <EditContactForm contact={contact} clientId={clientId} onDone={() => setEditing(false)} />

  return (
    <div className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {fullName(contact)}
          {contact.is_primary && (
            <span className="text-[11px] text-[#16A34A] border border-[#16A34A]/30 rounded-full px-2 py-0.5">Primary</span>
          )}
          {contact.portal_access && (
            <span className="text-[11px] text-[#3B82F6] border border-[#3B82F6]/30 rounded-full px-2 py-0.5">Invited</span>
          )}
        </div>
        <div className="text-xs text-[#5A5E66] mt-0.5 truncate">
          {[contact.role, contact.email, contact.phone].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <PortalAccessButton contact={contact} clientId={clientId} />
        <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">Edit</button>
        <DeleteContactButton contactId={contact.id} clientId={clientId} />
      </div>
    </div>
  )
}

export default function ContactsSection({ clientId, contacts }: { clientId: string; contacts: Contact[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Contacts</div>
        <div className="text-sm text-[#5A5E66]">{contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}</div>
      </div>

      {contacts.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No contacts yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {contacts.map((c) => <ContactRow key={c.id} contact={c} clientId={clientId} />)}
        </div>
      )}

      <AddContactForm clientId={clientId} />
    </div>
  )
}

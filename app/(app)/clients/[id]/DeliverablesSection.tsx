'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  addDeliverableAction,
  updateDeliverableAction,
  deleteDeliverableAction,
  type DeliverableState,
} from './deliverableActions'
import { CADENCE_LABEL, CADENCE_OPTIONS, type Cadence } from '@/lib/deliverableConstants'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

export type Deliverable = {
  id: string
  label: string
  quantity: number | null
  cadence: string | null
  notes: string | null
}

const initial: DeliverableState = { error: null, ok: false }

// "12 / month", "Ongoing", "1 one-off", or just the quantity when there's no cadence.
function scopeLabel(quantity: number | null, cadence: string | null): string | null {
  const cad = cadence as Cadence | null
  const cadLabel = cad ? CADENCE_LABEL[cad] : null
  if (quantity != null && cadLabel) return `${quantity} ${cadLabel}`
  if (cadLabel) return cadLabel
  if (quantity != null) return String(quantity)
  return null
}

function DeliverableFields({ d }: { d?: Deliverable }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Label *</label>
        <input name="label" required defaultValue={d?.label ?? ''} className={fieldCls} placeholder="Instagram posts" />
      </div>
      <div>
        <label className={labelCls}>Quantity</label>
        <input name="quantity" type="number" min="0" step="any" defaultValue={d?.quantity ?? ''} className={fieldCls} placeholder="12" />
      </div>
      <div>
        <label className={labelCls}>Cadence</label>
        <select name="cadence" defaultValue={d?.cadence ?? ''} className={fieldCls}>
          <option value="">—</option>
          {CADENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={d?.notes ?? ''} className={fieldCls} />
      </div>
    </div>
  )
}

function AddDeliverableForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addDeliverableAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add deliverable</div>
      <input type="hidden" name="client_id" value={clientId} />
      <DeliverableFields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Adding…' : 'Add deliverable'}
        </button>
      </div>
    </form>
  )
}

function EditDeliverableForm({ deliverable, clientId, onDone }: { deliverable: Deliverable; clientId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateDeliverableAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="px-5 py-4 border-b border-[#ECECEE] last:border-b-0 bg-[#FBFBFC]">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="deliverable_id" value={deliverable.id} />
      <DeliverableFields d={deliverable} />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function DeleteDeliverableButton({ deliverableId, clientId }: { deliverableId: string; clientId: string }) {
  const [state, action, pending] = useActionState(deleteDeliverableAction, initial)
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm('Delete this deliverable?')) e.preventDefault() }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="deliverable_id" value={deliverableId} />
      <button type="submit" disabled={pending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">
        Delete
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function DeliverableRow({ deliverable, clientId }: { deliverable: Deliverable; clientId: string }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <EditDeliverableForm deliverable={deliverable} clientId={clientId} onDone={() => setEditing(false)} />

  const scope = scopeLabel(deliverable.quantity, deliverable.cadence)
  return (
    <div className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {deliverable.label}
          {scope && (
            <span className="text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">{scope}</span>
          )}
        </div>
        {deliverable.notes && <div className="text-xs text-[#9398A1] mt-1">{deliverable.notes}</div>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">Edit</button>
        <DeleteDeliverableButton deliverableId={deliverable.id} clientId={clientId} />
      </div>
    </div>
  )
}

export default function DeliverablesSection({ clientId, deliverables }: { clientId: string; deliverables: Deliverable[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Deliverables</div>
        <div className="text-sm text-[#5A5E66]">{deliverables.length} {deliverables.length === 1 ? 'deliverable' : 'deliverables'}</div>
      </div>

      {deliverables.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No deliverables yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {deliverables.map((d) => <DeliverableRow key={d.id} deliverable={d} clientId={clientId} />)}
        </div>
      )}

      <AddDeliverableForm clientId={clientId} />
    </div>
  )
}

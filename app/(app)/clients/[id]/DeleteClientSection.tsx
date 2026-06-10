'use client'

import { useActionState, useState } from 'react'
import { deleteClientAction, type FormState } from './actions'

const initial: FormState = { error: null, ok: false }

// Admin-only, shown only for inactive/archived clients (the two-step gate). The RPC
// re-enforces both — this is just the surface.
export default function DeleteClientSection({
  clientId,
  clientName,
}: {
  clientId: string
  clientName: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-red-200 rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold text-red-700 mb-1">Danger zone</div>
      <p className="text-sm text-[#5A5E66] mb-4">
        Permanently delete this client and everything attached to it. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 border border-red-200 rounded-lg px-4 py-2 font-medium hover:bg-red-50"
      >
        Delete permanently
      </button>
      {open && <DeleteModal clientId={clientId} clientName={clientName} onClose={() => setOpen(false)} />}
    </div>
  )
}

function DeleteModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string
  clientName: string
  onClose: () => void
}) {
  // On success the action redirects to /clients, so there's no ok state to handle here.
  const [state, action, pending] = useActionState(deleteClientAction, initial)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold mb-2">Delete {clientName} permanently</div>
        <p className="text-sm text-[#5A5E66] mb-4">
          This permanently deletes {clientName} and ALL associated data — content, versions, comments, approvals,
          tasks. This cannot be undone.
        </p>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="client_id" value={clientId} />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm text-[#5A5E66] rounded-lg px-4 py-2 font-medium hover:bg-[#FBFBFC]">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {pending ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

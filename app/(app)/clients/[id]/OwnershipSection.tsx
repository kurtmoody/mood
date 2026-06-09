'use client'

import { useActionState } from 'react'
import { setClientOwnershipAction, type OwnershipState } from './clientOwnershipActions'
import { OWNERSHIP_ROLES, type Ownership } from '@/lib/ownershipRoles'

export type TeamOption = { id: string; full_name: string }

const initial: OwnershipState = { error: null, ok: false }
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white'
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'

export default function OwnershipSection({ clientId, ownership, teamMembers }: {
  clientId: string
  ownership: Ownership | null
  teamMembers: TeamOption[]
}) {
  const [state, action, pending] = useActionState(setClientOwnershipAction, initial)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Ownership</div>
        <div className="text-sm text-[#5A5E66]">Internal — who owns what for this client. Never shown to clients.</div>
      </div>

      <form action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
        <input type="hidden" name="client_id" value={clientId} />
        <div className="grid grid-cols-2 gap-4">
          {OWNERSHIP_ROLES.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={key} className={labelCls}>{label}</label>
              <select id={key} name={key} defaultValue={ownership?.[key] ?? ''} className={fieldCls}>
                <option value="">— none —</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          ))}
        </div>
        {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save ownership'}
          </button>
          {state.ok && <span className="text-sm text-[#16A34A]">Saved.</span>}
        </div>
      </form>
    </div>
  )
}

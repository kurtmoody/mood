'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { updateClientAction, type FormState } from './actions'
import ClientFormFields, { type ClientDefaults, type TeamOption } from '../ClientFormFields'
import { btnPrimary } from '@/components/ui'

const initial: FormState = { error: null, ok: false }

export default function EditClientForm({
  clientId,
  defaults,
  teamMembers,
}: {
  clientId: string
  defaults: ClientDefaults
  teamMembers: TeamOption[]
}) {
  const [state, action, pending] = useActionState(updateClientAction, initial)

  return (
    <form action={action} className="flex flex-col gap-5 max-w-[680px]">
      <input type="hidden" name="client_id" value={clientId} />
      <ClientFormFields defaults={defaults} teamMembers={teamMembers} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={btnPrimary}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Link href="/clients" className="text-sm text-[#5A5E66] rounded-lg px-3 py-2.5 hover:bg-[#F4F4F6]">
          Back to clients
        </Link>
        {state.ok && <span className="text-sm text-[#16A34A]">Saved.</span>}
      </div>
    </form>
  )
}

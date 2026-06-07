'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createClientAction, type FormState } from './actions'
import ClientFormFields from '../ClientFormFields'

const initial: FormState = { error: null }

export default function NewClientForm() {
  const [state, action, pending] = useActionState(createClientAction, initial)

  return (
    <form action={action} className="flex flex-col gap-5 max-w-[680px]">
      <ClientFormFields />

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

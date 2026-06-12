'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addTeamMemberAction, type FormState } from './actions'
import { labelCls, fieldCls, btnPrimary } from '@/components/ui'

const initial: FormState = { error: null, ok: false }

export default function AddTeamMemberForm() {
  const [state, action, pending] = useActionState(addTeamMemberAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  // Clear the inputs after a successful add (the list refreshes server-side).
  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add team member</div>
      <div className="grid grid-cols-[1.4fr_1fr_1.4fr_auto] gap-3 items-end">
        <div>
          <label htmlFor="full_name" className={labelCls}>Full name *</label>
          <input id="full_name" name="full_name" required className={fieldCls} placeholder="Jane Borg" />
        </div>
        <div>
          <label htmlFor="role" className={labelCls}>Role</label>
          <input id="role" name="role" className={fieldCls} placeholder="Designer" />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input id="email" name="email" type="email" className={fieldCls} placeholder="jane@mood.mt" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={btnPrimary}
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
    </form>
  )
}

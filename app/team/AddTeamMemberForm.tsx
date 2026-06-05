'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addTeamMemberAction, type FormState } from './actions'

const initial: FormState = { error: null, ok: false }
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white'
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'

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
          className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
    </form>
  )
}

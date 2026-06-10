'use client'

import { useActionState } from 'react'
import { setAgencyCostPerHourAction, type CostState } from './costActions'

const initial: CostState = { error: null, ok: false }

export default function CostEditor({ agencyId, current }: { agencyId: string; current: number | null }) {
  const [state, action, pending] = useActionState(setAgencyCostPerHourAction, initial)

  return (
    <form action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5 max-w-md">
      <input type="hidden" name="agency_id" value={agencyId} />
      <label htmlFor="rate" className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">
        Cost per hour (€)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="rate"
          name="rate"
          type="number"
          step="0.01"
          min="0"
          defaultValue={current ?? ''}
          placeholder="Not set"
          className="w-40 border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.ok && <span className="text-sm text-[#16A34A]">Saved.</span>}
      </div>
      <p className="text-xs text-[#9398A1] mt-2">Blended internal rate used to estimate time-cost in profitability reporting. Leave blank for &ldquo;not set&rdquo;.</p>
      {state.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}
    </form>
  )
}

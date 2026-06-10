'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setClientTimesheetEnabledAction } from './timesheetActions'

// Admin-only per-client toggle for the timesheet UI surface.
export default function TimesheetEnableToggle({ clientId, enabled }: { clientId: string; enabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true); setError(null)
    const r = await setClientTimesheetEnabledAction(clientId, !enabled)
    setBusy(false)
    if (r.error) setError(r.error)
    else router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`text-sm rounded-lg px-4 py-2 font-medium border disabled:opacity-50 ${enabled ? 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]' : 'bg-[#15171C] text-white border-[#15171C]'}`}
      >
        {enabled ? 'Disable timesheet' : 'Enable timesheet'}
      </button>
      <span className="text-xs text-[#9398A1]">Timesheet is {enabled ? 'on' : 'off'} for this client.</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

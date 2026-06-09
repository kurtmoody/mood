'use client'

import { useState } from 'react'
import { TASK_TYPES } from '@/lib/taskConstants'
import { setRaciMatrixAction, type RaciCell } from './raciActions'

type Member = { id: string; full_name: string }
const RACI_VALUES = ['', 'A', 'R', 'S', 'C', 'I', 'A/R'] // '' = — (no assignment)
const key = (taskType: string, memberId: string) => `${taskType}|${memberId}`

export default function RaciEditor({ agencyId, members, cells, loadError }: {
  agencyId: string
  members: Member[]
  cells: RaciCell[]
  loadError: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const c of cells) v[key(c.task_type, c.team_member_id)] = c.raci_value
    return v
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function set(taskType: string, memberId: string, value: string) {
    setSaved(false)
    setValues((prev) => ({ ...prev, [key(taskType, memberId)]: value }))
  }

  async function save() {
    setPending(true); setError(null); setSaved(false)
    const payload: RaciCell[] = []
    for (const t of TASK_TYPES) {
      for (const m of members) {
        const val = values[key(t, m.id)]
        if (val) payload.push({ task_type: t, team_member_id: m.id, raci_value: val })
      }
    }
    const r = await setRaciMatrixAction(agencyId, payload)
    setPending(false)
    if (r.error) { setError(r.error); return }
    setSaved(true)
  }

  if (members.length === 0) {
    return <div className="border border-dashed border-[#ECECEE] rounded-xl px-4 py-8 text-center text-sm text-[#9398A1]">No active team members. Add team members first.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div className="rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">⚠️ Couldn&rsquo;t load the current grid. Please refresh before editing.</div>
      )}

      <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#ECECEE]">
              <th className="text-left font-semibold px-4 py-2.5 text-[11px] uppercase tracking-wide text-[#9398A1] sticky left-0 bg-white min-w-[220px]">Task type</th>
              {members.map((m) => (
                <th key={m.id} className="font-semibold px-2 py-2.5 text-[11px] uppercase tracking-wide text-[#9398A1] whitespace-nowrap">{m.full_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TASK_TYPES.map((t) => (
              <tr key={t} className="border-b border-[#ECECEE] last:border-b-0">
                <td className="px-4 py-2 text-[#15171C] sticky left-0 bg-white min-w-[220px]">{t}</td>
                {members.map((m) => (
                  <td key={m.id} className="px-2 py-1.5 text-center">
                    <select
                      value={values[key(t, m.id)] ?? ''}
                      onChange={(e) => set(t, m.id, e.target.value)}
                      aria-label={`${t} — ${m.full_name}`}
                      className="border border-[#E2E2E5] rounded-md px-1.5 py-1 text-sm bg-white cursor-pointer"
                    >
                      {RACI_VALUES.map((v) => <option key={v || 'none'} value={v}>{v || '—'}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer">
          {pending ? 'Saving…' : 'Save matrix'}
        </button>
        {saved && <span className="text-sm text-[#16A34A]">Saved.</span>}
      </div>
    </div>
  )
}

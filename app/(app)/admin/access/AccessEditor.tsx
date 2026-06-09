'use client'

import { useEffect, useState } from 'react'
import { setMemberRoleAction } from './accessActions'

export type AccessMember = { userId: string; role: string; fullName: string; email: string | null }

export default function AccessEditor({ agencyId, currentUserId, members, loadError }: {
  agencyId: string
  currentUserId: string
  members: AccessMember[]
  loadError: boolean
}) {
  const [rows, setRows] = useState(members)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Re-sync from the server after a successful change (revalidate) / external update.
  const sig = members.map((m) => `${m.userId}:${m.role}`).join('|')
  useEffect(() => { setRows(members) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const adminCount = rows.filter((r) => r.role === 'agency_admin').length

  async function change(userId: string, role: string) {
    setBusyId(userId); setError(null); setSavedId(null)
    const prev = rows
    setRows((rs) => rs.map((r) => (r.userId === userId ? { ...r, role } : r))) // optimistic
    const r = await setMemberRoleAction(userId, agencyId, role)
    setBusyId(null)
    if (r.error) { setRows(prev); setError(r.error); return } // revert
    setSavedId(userId)
  }

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <div className="rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">⚠️ Couldn&rsquo;t load team access. Please refresh.</div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#9398A1]">No agency users.</div>
        ) : rows.map((m) => {
          const isLastAdmin = m.role === 'agency_admin' && adminCount <= 1
          return (
            <div key={m.userId} className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.fullName}
                  {m.userId === currentUserId && <span className="text-[#9398A1] font-normal"> (you)</span>}
                </div>
                {m.email && <div className="text-xs text-[#9398A1] truncate">{m.email}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isLastAdmin && (
                  <span title="At least one admin is required" className="text-[11px] text-[#9398A1] cursor-help">Last admin</span>
                )}
                {savedId === m.userId && <span className="text-xs text-[#16A34A]">Saved</span>}
                <select
                  value={m.role}
                  disabled={busyId === m.userId || isLastAdmin}
                  onChange={(e) => change(m.userId, e.target.value)}
                  className="border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="agency_admin">Admin</option>
                  <option value="agency_member">Member</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-[#9398A1]">Admins can manage agency settings (the Admin area). Members have full agency access but not admin config. At least one admin is always required.</p>
    </div>
  )
}

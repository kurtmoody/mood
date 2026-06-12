'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  updateTeamMemberAction,
  setTeamMemberActiveAction,
  deleteTeamMemberAction,
  type FormState,
} from './actions'
import { labelCls, fieldCls, btnPrimary, btnDanger, btnGhost } from '@/components/ui'

export type Member = {
  id: string
  full_name: string
  role: string | null
  email: string | null
  is_active: boolean
  has_login: boolean
}

const initial: FormState = { error: null, ok: false }
const gridCls = 'grid grid-cols-[1.4fr_1fr_1.4fr_auto_auto] gap-4 px-5 items-center'

export default function TeamList({ members, isAdmin }: { members: Member[]; isAdmin: boolean }) {
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [editing, setEditing] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState<Member | null>(null)

  const visible = filter === 'active' ? members.filter((m) => m.is_active) : members
  const inactiveCount = members.filter((m) => !m.is_active).length
  const activeMembers = members.filter((m) => m.is_active)

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#ECECEE]">
        <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
          {visible.length} {visible.length === 1 ? 'member' : 'members'}
        </div>
        <div className="inline-flex rounded-lg border border-[#E2E2E5] overflow-hidden text-xs">
          {(['active', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 font-semibold ${filter === f ? 'bg-[#15171C] text-white' : 'bg-white text-[#5A5E66]'}`}
            >
              {f === 'active' ? 'Active' : `All${inactiveCount ? ` (${inactiveCount} inactive)` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className={`${gridCls} py-2.5 border-b border-[#ECECEE] text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold`}>
        <div>Name</div>
        <div>Role</div>
        <div>Email</div>
        <div>Status</div>
        <div className="text-right">Actions</div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[#5A5E66]">No members to show.</div>
      ) : (
        visible.map((m) => (
          <Row
            key={m.id}
            m={m}
            isAdmin={isAdmin}
            onEdit={() => setEditing(m)}
            onDelete={() => setDeleting(m)}
          />
        ))
      )}

      {editing && <EditModal member={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteModal
          member={deleting}
          successors={activeMembers.filter((m) => m.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function Row({ m, isAdmin, onEdit, onDelete }: { m: Member; isAdmin: boolean; onEdit: () => void; onDelete: () => void }) {
  const [state, action, pending] = useActionState(setTeamMemberActiveAction, initial)

  const confirmDeactivate = (e: React.FormEvent) => {
    const base = m.has_login
      ? 'Deactivate this member? This person has a login — deactivating removes them from the active roster and assignment lists, but their account access remains.'
      : 'Deactivate this member? They will drop out of assignment lists. You can reactivate them later.'
    if (!confirm(base)) e.preventDefault()
  }

  return (
    <div className={`${gridCls} py-3.5 border-b border-[#ECECEE] last:border-b-0 ${m.is_active ? '' : 'opacity-60'}`}>
      <div className="text-sm font-semibold">{m.full_name}</div>
      <div className="text-sm text-[#5A5E66]">{m.role ?? '—'}</div>
      <div className="text-sm text-[#5A5E66]">{m.email ?? '—'}</div>
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.is_active ? '#16A34A' : '#A6ABB3' }} />
          {m.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-sm text-[#5A5E66] border border-[#E2E2E5] rounded-lg px-3 py-1.5 font-medium hover:bg-[#FBFBFC]"
        >
          Edit
        </button>
        <form action={action} onSubmit={m.is_active ? confirmDeactivate : undefined}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="is_active" value={m.is_active ? 'false' : 'true'} />
          <button
            type="submit"
            disabled={pending}
            className="text-sm text-[#5A5E66] border border-[#E2E2E5] rounded-lg px-3 py-1.5 font-medium hover:bg-[#FBFBFC] disabled:opacity-50"
          >
            {m.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </form>
        {isAdmin && !m.is_active && (
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-red-600 border border-red-200 rounded-lg px-3 py-1.5 font-medium hover:bg-red-50"
          >
            Delete permanently
          </button>
        )}
      </div>
      {state.error && <div className="col-span-5 text-sm text-red-600 pt-2">{state.error}</div>}
    </div>
  )
}

function DeleteModal({
  member,
  successors,
  onClose,
}: {
  member: Member
  successors: Member[]
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(deleteTeamMemberAction, initial)

  useEffect(() => {
    if (state.ok) onClose()
  }, [state.ok, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 animate-overlay-in" role="dialog" aria-modal="true" aria-label={`Delete ${member.full_name} permanently`} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECECEE] shadow-xl p-6 animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold mb-2">Delete {member.full_name} permanently</div>
        <p className="text-sm text-[#5A5E66] mb-4">
          This permanently deletes {member.full_name} and reassigns their tasks, ownership and RACI to the chosen
          person. This cannot be undone.
        </p>
        {successors.length === 0 ? (
          <p className="text-sm text-red-600">
            There is no other active member to inherit their work. Add or reactivate someone first.
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={member.id} />
            <div>
              <label htmlFor="successor_id" className={labelCls}>Reassign their work to</label>
              <select id="successor_id" name="successor_id" required defaultValue="" className={fieldCls}>
                <option value="" disabled>Choose a successor…</option>
                {successors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={pending} className={btnDanger}>
                {pending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function EditModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateTeamMemberAction, initial)

  useEffect(() => {
    if (state.ok) onClose()
  }, [state.ok, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 animate-overlay-in" role="dialog" aria-modal="true" aria-label="Edit team member" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECECEE] shadow-xl p-6 animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold mb-4">Edit team member</div>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={member.id} />
          <div>
            <label htmlFor="edit_full_name" className={labelCls}>Full name *</label>
            <input id="edit_full_name" name="full_name" required defaultValue={member.full_name} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="edit_role" className={labelCls}>Role</label>
            <input id="edit_role" name="role" defaultValue={member.role ?? ''} className={fieldCls} placeholder="Designer" />
          </div>
          <div>
            <label htmlFor="edit_email" className={labelCls}>Email</label>
            <input id="edit_email" name="email" type="email" defaultValue={member.email ?? ''} className={fieldCls} placeholder="jane@mood.mt" />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#5A5E66]">
            <input type="checkbox" name="is_active" value="true" defaultChecked={member.is_active} />
            Active
          </label>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

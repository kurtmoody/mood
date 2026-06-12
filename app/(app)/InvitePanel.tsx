'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createInviteAction, extendInviteAction, revokeInviteAction, type InviteState } from './inviteActions'
import { labelCls, fieldCls, btnPrimary } from '@/components/ui'

export type Invite = {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
}

const initial: InviteState = { error: null, ok: false }

const ROLE_LABEL: Record<string, string> = {
  agency_member: 'Team member',
  client_approver: 'Approver',
  client_viewer: 'Viewer',
}

// scopeType 'agency' → fixed agency_member; 'client' → approver/viewer choice.
export default function InvitePanel({
  scopeType,
  scopeId,
  revalidate,
  invites,
}: {
  scopeType: 'agency' | 'client'
  scopeId: string
  revalidate: string
  invites: Invite[]
}) {
  const [state, action, pending] = useActionState(createInviteAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  const heading = scopeType === 'agency' ? 'Invite team member' : 'Invite to portal'

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-1">{heading}</div>
      <p className="text-sm text-[#5A5E66] mb-4">
        They sign in with a magic link at the normal login using this email — access is granted automatically once they do.
      </p>

      <form ref={formRef} action={action} className="flex items-end gap-3 flex-wrap">
        <input type="hidden" name="scope_type" value={scopeType} />
        <input type="hidden" name="scope_id" value={scopeId} />
        <input type="hidden" name="revalidate" value={revalidate} />
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="invite_email" className={labelCls}>Email</label>
          <input id="invite_email" name="email" type="email" required className={fieldCls} placeholder="name@example.com" />
        </div>
        {scopeType === 'client' && (
          <div className="min-w-[140px]">
            <label htmlFor="invite_role" className={labelCls}>Role</label>
            <select id="invite_role" name="role" defaultValue="client_approver" className={fieldCls}>
              <option value="client_approver">Approver</option>
              <option value="client_viewer">Viewer</option>
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className={btnPrimary}
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}

      {invites.length > 0 && (
        <div className="mt-5 border-t border-[#ECECEE] pt-4">
          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Pending invites</div>
          <div className="flex flex-col gap-1.5">
            {invites.map((inv) => <InviteRow key={inv.id} inv={inv} revalidate={revalidate} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// 'expired' / 'expires today' / 'N days left' — coarse on purpose, it's a hint.
function expiryHint(expiresAt: string): { label: string; expired: boolean } {
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'expired', expired: true }
  if (days === 0) return { label: 'expires today', expired: false }
  return { label: `${days} day${days === 1 ? '' : 's'} left`, expired: false }
}

function InviteRow({ inv, revalidate }: { inv: Invite; revalidate: string }) {
  const [revokeState, revoke, revoking] = useActionState(revokeInviteAction, initial)
  const [extendState, extend, extending] = useActionState(extendInviteAction, initial)
  const expiry = expiryHint(inv.expires_at)
  const error = revokeState.error ?? extendState.error

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate">{inv.email}</span>
        <span className="text-[11px] text-faint border border-line rounded-full px-2 py-0.5 shrink-0">
          {ROLE_LABEL[inv.role] ?? inv.role}
        </span>
        <span className={`text-[11px] shrink-0 ${expiry.expired ? 'text-accent' : 'text-faint'}`}>
          {expiry.label}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <form action={extend}>
          <input type="hidden" name="id" value={inv.id} />
          <input type="hidden" name="revalidate" value={revalidate} />
          <button type="submit" disabled={extending} className="text-muted hover:text-ink disabled:opacity-50 cursor-pointer">
            {extending ? 'Extending…' : 'Extend'}
          </button>
        </form>
        <form action={revoke}>
          <input type="hidden" name="id" value={inv.id} />
          <input type="hidden" name="revalidate" value={revalidate} />
          <button type="submit" disabled={revoking} className="text-muted hover:text-red-600 disabled:opacity-50 cursor-pointer">
            {revoking ? 'Revoking…' : 'Revoke'}
          </button>
        </form>
      </div>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}

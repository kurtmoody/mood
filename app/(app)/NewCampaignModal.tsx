'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createCampaignAction, type CampaignState } from './campaignActions'
import CampaignFormFields from './CampaignFormFields'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

type ClientOption = { id: string; name: string }

const initial: CampaignState = { error: null, ok: false }

// Global create-campaign slide-over (New → Campaign). Reuses CampaignFormFields; the client
// is a picker here (no client in the global context), preselected when the caller can infer one.
export default function NewCampaignModal({
  clients,
  defaultClientId = '',
  onClose,
}: {
  clients: ClientOption[]
  defaultClientId?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCampaignAction, initial)

  useEffect(() => { if (state.ok) { onClose(); router.refresh() } }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New campaign">
      <div className="absolute inset-0 bg-black/20 animate-overlay-in" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col animate-panel-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#ECECEE]">
          <h2 className="text-lg font-bold">New campaign</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form action={action} className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Client *</label>
            <select name="client_id" required defaultValue={defaultClientId} className={fieldCls}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <CampaignFormFields />

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? 'Creating…' : 'Create campaign'}
            </button>
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

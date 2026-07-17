'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setCampaignMetaLinksAction, syncNowAction, type MetaLinkState } from '../../metaSyncActions'
import { labelCls, fieldCls, btnPrimary, btnGhost, btnPrimarySm } from '@/components/ui'

export type MetaSync = {
  campaignId: string
  metaCampaignIds: string[]
  resultsAction: string | null
  lastSyncedAt: string | null
  syncError: string | null
}

const initial: MetaLinkState = { error: null, ok: false }

function fmtStamp(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null
}

function LinkForm({ sync, onDone }: { sync: MetaSync; onDone: () => void }) {
  const [state, action, pending] = useActionState(setCampaignMetaLinksAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="campaign_id" value={sync.campaignId} />
      <div>
        <label className={labelCls}>Meta campaign IDs</label>
        <textarea
          name="meta_campaign_ids"
          rows={2}
          defaultValue={sync.metaCampaignIds.join(', ')}
          className={fieldCls}
          placeholder="123456789, 987654321"
        />
        <p className="text-xs text-[#9398A1] mt-1">Ads Manager → Campaigns → the ID column. Separate several with commas.</p>
      </div>
      <div>
        <label className={labelCls}>Results action override <span className="text-[#9398A1] normal-case">· optional</span></label>
        <input name="meta_results_action" defaultValue={sync.resultsAction ?? ''} className={fieldCls} placeholder="e.g. lead, purchase, link_click" />
        <p className="text-xs text-[#9398A1] mt-1">Leave blank to map from the campaign objective.</p>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Save links'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

export default function MetaSyncPanel({ sync }: { sync: MetaSync }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linked = sync.metaCampaignIds.length > 0
  const stamp = fmtStamp(sync.lastSyncedAt)

  async function syncNow() {
    if (busy) return
    setBusy(true); setError(null)
    const r = await syncNowAction(sync.campaignId)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Meta sync</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">
            {linked ? 'Edit links' : 'Link Meta campaigns'}
          </button>
        )}
      </div>

      {editing ? (
        <LinkForm sync={sync} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-3">
          {linked ? (
            <div className="text-sm text-[#5A5E66]">
              Linked to <span className="text-ink font-medium">{sync.metaCampaignIds.length}</span> Meta campaign{sync.metaCampaignIds.length === 1 ? '' : 's'}
              {sync.resultsAction && <span className="text-[#9398A1]"> · results = {sync.resultsAction}</span>}
            </div>
          ) : (
            <div className="text-sm text-[#9398A1]">Not linked to Meta — link campaign IDs to pull spend and results automatically.</div>
          )}

          {sync.syncError && (
            <div className="rounded-xl bg-[#FEF3E9] border border-[#F6D9BF] px-4 py-3 text-sm text-[#C2410C]">
              {sync.syncError}
            </div>
          )}

          <div className="flex items-center gap-4">
            {linked && (
              <button onClick={syncNow} disabled={busy} className={btnPrimarySm}>
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            <span className="text-xs text-[#9398A1]">
              {stamp ? `Last synced: ${stamp}` : 'Never synced'}
            </span>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

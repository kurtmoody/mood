'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { OBJECTIVE_LABEL, type CampaignObjective } from '@/lib/campaignConstants'
import { PhasePill } from '../clients/[id]/CampaignsSection'
import NewCampaignModal from '../NewCampaignModal'
import { btnPrimary } from '@/components/ui'

export type IndexCampaign = {
  id: string
  clientId: string
  clientName: string
  clientArchived: boolean
  name: string
  objective: string | null
  phase: string
  start_date: string | null
  end_date: string | null
  media_budget: number | null
  taskComplete: number
  taskTotal: number
}

type ClientOption = { id: string; name: string }

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

function dateRange(start: string | null, end: string | null): string | null {
  const s = fmtDate(start)
  const e = fmtDate(end)
  if (s && e) return `${s} – ${e}`
  if (s) return `From ${s}`
  if (e) return `Until ${e}`
  return null
}

function ObjectivePill({ objective }: { objective: string | null }) {
  const obj = objective as CampaignObjective | null
  if (!obj) return null
  return <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#F4F4F5] text-[#5A5E66]">{OBJECTIVE_LABEL[obj]}</span>
}

function CampaignRow({ c }: { c: IndexCampaign }) {
  const range = dateRange(c.start_date, c.end_date)
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4 hover:bg-[#FBFBFC]"
    >
      <div className="min-w-0 flex items-center gap-2.5">
        <span className="text-sm font-semibold truncate">{c.name}</span>
        <ObjectivePill objective={c.objective} />
        <PhasePill phase={c.phase} />
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
        {c.taskTotal > 0 && <span>{c.taskComplete}/{c.taskTotal} tasks</span>}
        {c.media_budget != null && <span>€{c.media_budget.toLocaleString('en-GB')}</span>}
        {range && <span>{range}</span>}
      </div>
    </Link>
  )
}

export default function CampaignsIndex({ campaigns, clients }: { campaigns: IndexCampaign[]; clients: ClientOption[] }) {
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)

  const hasArchived = campaigns.some((c) => c.clientArchived)

  const visible = useMemo(
    () =>
      campaigns.filter((c) => {
        if (scope === 'open' && c.phase === 'closed') return false
        if (!showArchived && c.clientArchived) return false
        return true
      }),
    [campaigns, scope, showArchived],
  )

  // Group by client, clients ordered by name (rows already arrive newest-first per client).
  const groups = useMemo(() => {
    const byClient = new Map<string, { clientId: string; clientName: string; clientArchived: boolean; items: IndexCampaign[] }>()
    for (const c of visible) {
      let g = byClient.get(c.clientId)
      if (!g) { g = { clientId: c.clientId, clientName: c.clientName, clientArchived: c.clientArchived, items: [] }; byClient.set(c.clientId, g) }
      g.items.push(c)
    }
    return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [visible])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xl font-bold">Campaigns</div>
          <div className="text-sm text-[#5A5E66]">{visible.length} {visible.length === 1 ? 'campaign' : 'campaigns'}</div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/templates" className="text-sm text-[#5A5E66] hover:underline">Templates</Link>
          <button onClick={() => setCreating(true)} className={btnPrimary}>New campaign</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg border border-[#E2E2E5] overflow-hidden text-xs">
          {(['open', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-3 py-1 font-semibold ${scope === s ? 'bg-[#15171C] text-white' : 'bg-white text-[#5A5E66]'}`}
            >
              {s === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>
        {hasArchived && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
              showArchived ? 'bg-[#15171C] text-white border-[#15171C] font-medium' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'
            }`}
          >
            Show archived clients
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-12 text-center">
          <div className="text-sm text-[#5A5E66] mb-3">No campaigns yet.</div>
          <button onClick={() => setCreating(true)} className={btnPrimary}>New campaign</button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.clientId}>
              <div className="flex items-center gap-2 mb-2">
                <Link href={`/clients/${g.clientId}`} className="text-sm font-semibold text-[#5A5E66] hover:underline">{g.clientName}</Link>
                {g.clientArchived && <span className="text-[11px] text-[#9398A1]">archived</span>}
                <span className="text-xs text-[#9398A1]">· {g.items.length}</span>
              </div>
              <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
                {g.items.map((c) => <CampaignRow key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <NewCampaignModal clients={clients} onClose={() => setCreating(false)} />}
    </div>
  )
}

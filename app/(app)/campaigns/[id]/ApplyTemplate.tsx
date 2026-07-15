'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { spawnFromTemplateAction } from '../../templateActions'
import { OBJECTIVE_LABEL, type CampaignObjective } from '@/lib/campaignConstants'
import { btnPrimarySm } from '@/components/ui'

export type TemplateOption = { id: string; name: string; objective: string | null }

// Hub control to apply a template to an existing campaign. Only templates not already spawned into
// this campaign are offered (the RPC rejects a repeat anyway; this keeps the picker honest).
export default function ApplyTemplate({ campaignId, templates, appliedIds }: {
  campaignId: string
  templates: TemplateOption[]
  appliedIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = templates.filter((t) => !appliedIds.includes(t.id))

  async function apply() {
    if (!templateId || busy) return
    setBusy(true); setError(null)
    const r = await spawnFromTemplateAction(campaignId, templateId)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setOpen(false); setTemplateId('')
    router.refresh()
  }

  if (templates.length === 0) return null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-[#5A5E66] hover:underline">
        Apply template
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="rounded-lg border border-[#E2E2E5] px-2.5 py-1.5 text-sm text-[#5A5E66] cursor-pointer"
      >
        <option value="">Choose a template…</option>
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}{t.objective ? ` · ${OBJECTIVE_LABEL[t.objective as CampaignObjective]}` : ''}
          </option>
        ))}
      </select>
      <button onClick={apply} disabled={!templateId || busy} className={btnPrimarySm}>
        {busy ? 'Applying…' : 'Apply'}
      </button>
      <button onClick={() => { setOpen(false); setError(null) }} className="text-sm text-[#9398A1] hover:underline">Cancel</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setPostMetaAction } from '@/app/(app)/postActions'
import type { Item } from './Calendar'

type TeamOpt = { id: string; full_name: string }

const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white'

// Agency-only production metadata for a post (Monday "content grid" fields). Self-contained:
// fetches the Designer options (all active team members, incl. directory-only) and the
// derived PM (client's Lead PM) itself, and saves via set_post_meta (no version fork).
export default function ProductionDetails({ item, clientId }: { item: Item; clientId: string }) {
  const router = useRouter()
  const [team, setTeam] = useState<TeamOpt[]>([])
  const [pmName, setPmName] = useState<string | null>(null)

  const [designerId, setDesignerId] = useState<string>(item.designer_id ?? '')
  const [designStatus, setDesignStatus] = useState<string>(item.design_status ?? '')
  const [driveUrl, setDriveUrl] = useState<string>(item.drive_url ?? '')
  const [highResUrl, setHighResUrl] = useState<string>(item.high_res_url ?? '')
  const [boost, setBoost] = useState<boolean>(!!item.boost)
  const [adBudget, setAdBudget] = useState<string>(item.ad_budget != null ? String(item.ad_budget) : '')
  const [datePosted, setDatePosted] = useState<string>(item.date_posted ?? '')
  const [postedUrl, setPostedUrl] = useState<string>(item.posted_url ?? '')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Re-sync local fields when a different post is opened.
  useEffect(() => {
    setDesignerId(item.designer_id ?? '')
    setDesignStatus(item.design_status ?? '')
    setDriveUrl(item.drive_url ?? '')
    setHighResUrl(item.high_res_url ?? '')
    setBoost(!!item.boost)
    setAdBudget(item.ad_budget != null ? String(item.ad_budget) : '')
    setDatePosted(item.date_posted ?? '')
    setPostedUrl(item.posted_url ?? '')
    setSaved(false); setError(null)
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const [{ data: members }, { data: own }] = await Promise.all([
        // ALL active team members — directory-only members (no login) can be designers too.
        supabase.from('team_member').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('client_ownership').select('lead_pm:lead_pm_id ( full_name )').eq('client_id', clientId).maybeSingle(),
      ])
      setTeam((members as TeamOpt[]) ?? [])
      const pm = (own as any)?.lead_pm
      setPmName((Array.isArray(pm) ? pm[0]?.full_name : pm?.full_name) ?? null)
    })()
  }, [clientId])

  async function save() {
    if (busy) return
    let budget: number | null = null
    if (adBudget.trim() !== '') {
      budget = Number(adBudget)
      if (Number.isNaN(budget)) { setError('Advertising budget must be a number.'); return }
    }
    setBusy(true); setError(null); setSaved(false)
    const r = await setPostMetaAction(item.id, {
      designer_id: designerId || null,
      design_status: designStatus.trim() || null,
      drive_url: driveUrl.trim() || null,
      high_res_url: highResUrl.trim() || null,
      boost,
      ad_budget: budget,
      date_posted: datePosted || null,
      posted_url: postedUrl.trim() || null,
    })
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setSaved(true)
    router.refresh()
  }

  const isPosted = item.status === 'posted'

  return (
    <div className="mt-7 pt-5 border-t border-[#ECECEE]">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">Production details</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Designer</label>
          <select value={designerId} onChange={(e) => setDesignerId(e.target.value)} className={fieldCls}>
            <option value="">Unassigned</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Project manager</label>
          <div className="text-sm text-[#5A5E66] px-2.5 py-1.5">{pmName ?? '—'} <span className="text-[11px] text-[#9398A1]">· from ownership</span></div>
        </div>
        <div>
          <label className={labelCls}>Design status</label>
          <input value={designStatus} onChange={(e) => setDesignStatus(e.target.value)} className={fieldCls} placeholder="e.g. In progress" />
        </div>
        <div>
          <label className={labelCls}>Posted</label>
          <div className="text-sm text-[#5A5E66] px-2.5 py-1.5">{isPosted ? 'Yes' : 'No'} <span className="text-[11px] text-[#9398A1]">· from status</span></div>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Link to Drive</label>
          <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} type="url" className={fieldCls} placeholder="https://…" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>High-res link</label>
          <input value={highResUrl} onChange={(e) => setHighResUrl(e.target.value)} type="url" className={fieldCls} placeholder="https://…" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#5A5E66] mt-1">
          <input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} />
          Boost
        </label>
        <div>
          <label className={labelCls}>Advertising budget</label>
          <input value={adBudget} onChange={(e) => setAdBudget(e.target.value)} type="number" step="0.01" min="0" className={fieldCls} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Date posted</label>
          <input value={datePosted} onChange={(e) => setDatePosted(e.target.value)} type="date" className={fieldCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Posted link (proof)</label>
          <input value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} type="url" className={fieldCls} placeholder="https://… (live published post)" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={busy} className="bg-[#15171C] text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50 cursor-pointer">
          {busy ? 'Saving…' : 'Save production details'}
        </button>
        {saved && <span className="text-sm text-[#16A34A]">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}

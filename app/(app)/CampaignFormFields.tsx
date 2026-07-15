'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CAMPAIGN_OBJECTIVES, OBJECTIVE_LABEL, type CampaignObjective } from '@/lib/campaignConstants'
import { labelCls, fieldCls } from '@/components/ui'

type TemplateOpt = { id: string; name: string; objective: string | null }

// The shared create-campaign field set (name / objective / phase / dates / money / targets /
// brief), reused by the client-page AddCampaignForm and the global New → Campaign modal — one
// source of truth so the two never drift. Client selection is the caller's job: a hidden
// `client_id` input on a client page, a `<select name="client_id">` in the global modal.
//
// "Spawn from template" (slice 5): the picker lists agency templates, ordered so those matching
// the chosen objective come first (all still shown). On submit, createCampaignAction spawns the
// selected template into the new campaign and lands on the hub.
export default function CampaignFormFields() {
  const [objective, setObjective] = useState('')
  const [templates, setTemplates] = useState<TemplateOpt[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('campaign_template').select('id, name, objective').order('name')
      setTemplates((data as TemplateOpt[]) ?? [])
    })()
  }, [])

  // Matching-objective templates first, then the rest — all shown.
  const orderedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      const am = objective && a.objective === objective ? 0 : 1
      const bm = objective && b.objective === objective ? 0 : 1
      return am - bm || a.name.localeCompare(b.name)
    })
  }, [templates, objective])

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Name *</label>
        <input name="name" required className={fieldCls} placeholder="Summer launch" />
      </div>
      <div>
        <label className={labelCls}>Objective</label>
        <select name="objective" value={objective} onChange={(e) => setObjective(e.target.value)} className={fieldCls}>
          <option value="">—</option>
          {CAMPAIGN_OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABEL[o as CampaignObjective]}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Phase</label>
        {/* Only planning/closed at creation — production onward needs an approved brief (0057 gate). */}
        <select name="phase" defaultValue="planning" className={fieldCls}>
          {(['planning', 'closed'] as const).map((p) => <option key={p} value={p}>{p === 'planning' ? 'Planning' : 'Closed'}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Start date</label>
        <input name="start_date" type="date" className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>End date</label>
        <input name="end_date" type="date" className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Media budget (€)</label>
        <input name="media_budget" type="number" min="0" step="any" className={fieldCls} placeholder="1000" />
      </div>
      <div>
        <label className={labelCls}>Fee (€) <span className="text-[#9398A1] normal-case">· internal</span></label>
        <input name="fee" type="number" min="0" step="any" className={fieldCls} placeholder="5000" />
      </div>
      <div>
        <label className={labelCls}>KPI target (results)</label>
        <input name="kpi_target_results" type="number" min="0" step="any" className={fieldCls} placeholder="200" />
      </div>
      <div>
        <label className={labelCls}>Target cost / result (€)</label>
        <input name="kpi_target_cost_per_result" type="number" min="0" step="any" className={fieldCls} placeholder="20" />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Brief</label>
        <textarea name="brief" rows={3} className={fieldCls} placeholder="Goals, audience, messaging, deliverables…" />
      </div>
      {templates.length > 0 && (
        <div className="col-span-2">
          <label className={labelCls}>Spawn from template</label>
          <select name="template_id" defaultValue="" className={fieldCls}>
            <option value="">No template</option>
            {orderedTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.objective ? ` · ${OBJECTIVE_LABEL[t.objective as CampaignObjective]}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#9398A1] mt-1">Its tasks are created in the new campaign, scheduled from the start date.</p>
        </div>
      )}
    </div>
  )
}

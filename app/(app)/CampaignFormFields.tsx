'use client'

import { CAMPAIGN_OBJECTIVES, OBJECTIVE_LABEL, PHASE_LABEL, type CampaignObjective } from '@/lib/campaignConstants'
import { labelCls, fieldCls } from '@/components/ui'

// The shared create-campaign field set (name / objective / phase / dates / money / targets /
// brief), reused by the client-page AddCampaignForm and the global New → Campaign modal —
// one source of truth so the two never drift. Client selection is the caller's job: a hidden
// `client_id` input on a client page, a `<select name="client_id">` in the global modal.
export default function CampaignFormFields() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Name *</label>
        <input name="name" required className={fieldCls} placeholder="Summer launch" />
      </div>
      <div>
        <label className={labelCls}>Objective</label>
        <select name="objective" defaultValue="" className={fieldCls}>
          <option value="">—</option>
          {CAMPAIGN_OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABEL[o as CampaignObjective]}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Phase</label>
        {/* Only planning/closed at creation — production onward needs an approved brief (0057 gate). */}
        <select name="phase" defaultValue="planning" className={fieldCls}>
          {(['planning', 'closed'] as const).map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
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
    </div>
  )
}

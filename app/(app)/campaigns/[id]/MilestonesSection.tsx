'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMilestoneAction,
  updateMilestoneAction,
  deleteMilestoneAction,
  reorderMilestonesAction,
  type MilestoneState,
} from '../../milestoneActions'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

export type Milestone = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  status: string
  sort_order: number
}

const initial: MilestoneState = { error: null, ok: false }

const STATUS_META: Record<string, { label: string; pill: string }> = {
  upcoming: { label: 'Upcoming', pill: 'bg-[#F4F4F5] text-[#5A5E66]' },
  in_progress: { label: 'In progress', pill: 'bg-[#EEF2FF] text-[#4F46E5]' },
  done: { label: 'Done', pill: 'bg-[#ECFDF3] text-[#16A34A]' },
}

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null
}

function dateRange(start: string | null, end: string | null): string | null {
  const s = fmtDate(start)
  const e = fmtDate(end)
  if (s && e) return `${s} – ${e}`
  if (s) return `From ${s}`
  if (e) return `By ${e}`
  return null
}

function Fields({ m }: { m?: Milestone }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Title *</label>
        <input name="title" required defaultValue={m?.title ?? ''} className={fieldCls} placeholder="Creative sign-off" />
      </div>
      <div>
        <label className={labelCls}>Start date</label>
        <input name="start_date" type="date" defaultValue={m?.start_date ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>End date</label>
        <input name="end_date" type="date" defaultValue={m?.end_date ?? ''} className={fieldCls} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Status</label>
        <select name="status" defaultValue={m?.status ?? 'upcoming'} className={fieldCls}>
          {Object.entries(STATUS_META).map(([v, meta]) => <option key={v} value={v}>{meta.label}</option>)}
        </select>
      </div>
    </div>
  )
}

function AddForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(addMilestoneAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])
  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add milestone</div>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Fields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Adding…' : 'Add milestone'}</button>
      </div>
    </form>
  )
}

function EditForm({ milestone, campaignId, onDone }: { milestone: Milestone; campaignId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateMilestoneAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="px-5 py-4 border-b border-[#ECECEE] last:border-b-0 bg-[#FBFBFC]">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="milestone_id" value={milestone.id} />
      <Fields m={milestone} />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

function DeleteButton({ milestoneId, campaignId }: { milestoneId: string; campaignId: string }) {
  const [state, action, pending] = useActionState(deleteMilestoneAction, initial)
  return (
    <form action={action} onSubmit={(e) => { if (!confirm('Delete this milestone?')) e.preventDefault() }}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="milestone_id" value={milestoneId} />
      <button type="submit" disabled={pending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">Delete</button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function Row({ milestone, campaignId, onMove, isFirst, isLast }: {
  milestone: Milestone
  campaignId: string
  onMove: (dir: -1 | 1) => void
  isFirst: boolean
  isLast: boolean
}) {
  const [editing, setEditing] = useState(false)
  if (editing) return <EditForm milestone={milestone} campaignId={campaignId} onDone={() => setEditing(false)} />

  const range = dateRange(milestone.start_date, milestone.end_date)
  const meta = STATUS_META[milestone.status] ?? STATUS_META.upcoming
  return (
    <div className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-center gap-2.5">
        <div className="flex flex-col -my-1 text-[#C0C4CC]">
          <button onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up" className="leading-none hover:text-[#5A5E66] disabled:opacity-30 disabled:hover:text-[#C0C4CC]">▲</button>
          <button onClick={() => onMove(1)} disabled={isLast} aria-label="Move down" className="leading-none hover:text-[#5A5E66] disabled:opacity-30 disabled:hover:text-[#C0C4CC]">▼</button>
        </div>
        <span className="text-sm font-semibold truncate">{milestone.title}</span>
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${meta.pill}`}>{meta.label}</span>
        {range && <span className="text-xs text-[#9398A1]">{range}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">Edit</button>
        <DeleteButton milestoneId={milestone.id} campaignId={campaignId} />
      </div>
    </div>
  )
}

export default function MilestonesSection({ campaignId, milestones }: { campaignId: string; milestones: Milestone[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= milestones.length) return
    const ids = milestones.map((m) => m.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    setError(null)
    const r = await reorderMilestonesAction(campaignId, ids)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Milestones</h2>
        <span className="text-sm text-[#9398A1]">{milestones.length}</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {milestones.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-8 text-center text-sm text-[#5A5E66]">
          No milestones yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {milestones.map((m, i) => (
            <Row
              key={m.id}
              milestone={m}
              campaignId={campaignId}
              onMove={(dir) => move(i, dir)}
              isFirst={i === 0}
              isLast={i === milestones.length - 1}
            />
          ))}
        </div>
      )}

      <AddForm campaignId={campaignId} />
    </div>
  )
}

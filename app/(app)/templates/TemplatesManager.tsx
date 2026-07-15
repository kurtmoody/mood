'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTemplateAction, updateTemplateAction, deleteTemplateAction,
  addTemplateTaskAction, updateTemplateTaskAction, deleteTemplateTaskAction,
  reorderTemplateTasksAction, type TemplateState,
} from '../templateActions'
import { CAMPAIGN_OBJECTIVES, OBJECTIVE_LABEL, type CampaignObjective } from '@/lib/campaignConstants'
import { TASK_TYPES } from '@/lib/taskConstants'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

export type TemplateTask = {
  id: string
  template_id: string
  title: string
  task_type: string | null
  estimated_hours: number | null
  start_offset_days: number | null
  due_offset_days: number | null
  sort_order: number
}
export type Template = { id: string; name: string; objective: string | null; tasks: TemplateTask[] }

const initial: TemplateState = { error: null, ok: false }

function offsetLabel(t: TemplateTask): string {
  const s = t.start_offset_days
  const d = t.due_offset_days
  if (s != null && d != null) return s === d ? `Day ${s}` : `Day ${s}–${d}`
  if (d != null) return `Due day ${d}`
  if (s != null) return `Start day ${s}`
  return 'No offset'
}

function ObjectivePill({ objective }: { objective: string | null }) {
  const o = objective as CampaignObjective | null
  if (!o) return null
  return <span className="text-[11px] rounded-full px-2 py-0.5 bg-[#F4F4F5] text-[#5A5E66]">{OBJECTIVE_LABEL[o]}</span>
}

function TemplateFields({ t }: { t?: Template }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Name *</label>
        <input name="name" required defaultValue={t?.name ?? ''} className={fieldCls} placeholder="Product launch" />
      </div>
      <div>
        <label className={labelCls}>Objective</label>
        <select name="objective" defaultValue={t?.objective ?? ''} className={fieldCls}>
          <option value="">—</option>
          {CAMPAIGN_OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABEL[o as CampaignObjective]}</option>)}
        </select>
      </div>
    </div>
  )
}

function TaskFields({ t }: { t?: TemplateTask }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Title *</label>
        <input name="title" required defaultValue={t?.title ?? ''} className={fieldCls} placeholder="Draft creative" />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Task type</label>
        <select name="task_type" defaultValue={t?.task_type ?? ''} className={fieldCls}>
          <option value="">—</option>
          {TASK_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Estimated hours</label>
        <input name="estimated_hours" type="number" min="0" step="0.5" defaultValue={t?.estimated_hours ?? ''} className={fieldCls} placeholder="3" />
      </div>
      <div />
      <div>
        <label className={labelCls}>Start offset (days)</label>
        <input name="start_offset_days" type="number" min="0" step="1" defaultValue={t?.start_offset_days ?? ''} className={fieldCls} placeholder="0" />
      </div>
      <div>
        <label className={labelCls}>Due offset (days)</label>
        <input name="due_offset_days" type="number" min="0" step="1" defaultValue={t?.due_offset_days ?? ''} className={fieldCls} placeholder="3" />
      </div>
    </div>
  )
}

function AddTaskForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(addTemplateTaskAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])
  return (
    <form ref={ref} action={action} className="px-5 py-4 bg-[#FBFBFC] border-t border-[#ECECEE]">
      <div className="text-xs font-semibold mb-3">Add task</div>
      <input type="hidden" name="template_id" value={templateId} />
      <TaskFields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Adding…' : 'Add task'}</button>
      </div>
    </form>
  )
}

function EditTaskForm({ task, onDone }: { task: TemplateTask; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateTemplateTaskAction, initial)
  useEffect(() => { if (state.ok) onDone() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="px-5 py-4 bg-[#FBFBFC] border-b border-[#F4F4F5]">
      <input type="hidden" name="task_id" value={task.id} />
      <TaskFields t={task} />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onDone} className={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(deleteTemplateTaskAction, initial)
  return (
    <form action={action} onSubmit={(e) => { if (!confirm('Delete this task?')) e.preventDefault() }}>
      <input type="hidden" name="task_id" value={taskId} />
      <button type="submit" disabled={pending} className="text-xs text-[#E0572E] hover:underline disabled:opacity-50">Delete</button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function TaskRow({ task, onMove, isFirst, isLast }: { task: TemplateTask; onMove: (d: -1 | 1) => void; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <EditTaskForm task={task} onDone={() => setEditing(false)} />
  return (
    <div className="px-5 py-3 border-b border-[#F4F4F5] last:border-b-0 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-center gap-2.5">
        <div className="flex flex-col -my-1 text-[#C0C4CC]">
          <button onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up" className="leading-none hover:text-[#5A5E66] disabled:opacity-30">▲</button>
          <button onClick={() => onMove(1)} disabled={isLast} aria-label="Move down" className="leading-none hover:text-[#5A5E66] disabled:opacity-30">▼</button>
        </div>
        <span className="text-sm truncate">{task.title}</span>
        {task.task_type && <span className="text-[11px] text-[#9398A1] truncate">{task.task_type}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
        {task.estimated_hours != null && <span>{task.estimated_hours}h</span>}
        <span>{offsetLabel(task)}</span>
        <button onClick={() => setEditing(true)} className="text-[#5A5E66] hover:underline">Edit</button>
        <DeleteTaskButton taskId={task.id} />
      </div>
    </div>
  )
}

function TemplateCard({ template }: { template: Template }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [moveErr, setMoveErr] = useState<string | null>(null)
  const [editState, editAction, editPending] = useActionState(updateTemplateAction, initial)
  const [delState, delAction, delPending] = useActionState(deleteTemplateAction, initial)
  useEffect(() => { if (editState.ok) setEditing(false) }, [editState.ok])

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= template.tasks.length) return
    const ids = template.tasks.map((t) => t.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    setMoveErr(null)
    const r = await reorderTemplateTasksAction(template.id, ids)
    if (r.error) { setMoveErr(r.error); return }
    router.refresh()
  }

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
      {editing ? (
        <form action={editAction} className="px-5 py-4 border-b border-[#ECECEE] bg-[#FBFBFC]">
          <input type="hidden" name="template_id" value={template.id} />
          <TemplateFields t={template} />
          {editState.error && <p className="text-sm text-red-600 mt-3">{editState.error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={editPending} className={btnPrimary}>{editPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="px-5 py-4 border-b border-[#ECECEE] flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="text-sm font-bold truncate">{template.name}</span>
            <ObjectivePill objective={template.objective} />
            <span className="text-xs text-[#9398A1]">· {template.tasks.length} {template.tasks.length === 1 ? 'task' : 'tasks'}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setEditing(true)} className="text-sm text-[#5A5E66] hover:underline">Edit</button>
            <form action={delAction} onSubmit={(e) => { if (!confirm('Delete this template? Already-spawned tasks are unaffected.')) e.preventDefault() }}>
              <input type="hidden" name="template_id" value={template.id} />
              <button type="submit" disabled={delPending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">Delete</button>
            </form>
          </div>
        </div>
      )}

      {moveErr && <p className="text-sm text-red-600 px-5 pt-3">{moveErr}</p>}
      {delState.error && <p className="text-sm text-red-600 px-5 pt-3">{delState.error}</p>}

      {template.tasks.map((t, i) => (
        <TaskRow key={t.id} task={t} onMove={(d) => move(i, d)} isFirst={i === 0} isLast={i === template.tasks.length - 1} />
      ))}

      <AddTaskForm templateId={template.id} />
    </div>
  )
}

function CreateTemplateForm() {
  const [state, action, pending] = useActionState(createTemplateAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])
  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">New template</div>
      <TemplateFields />
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Creating…' : 'Create template'}</button>
      </div>
    </form>
  )
}

export default function TemplatesManager({ templates }: { templates: Template[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xl font-bold">Campaign templates</div>
          <div className="text-sm text-[#5A5E66]">Reusable task blueprints spawned into a campaign</div>
        </div>
        <Link href="/campaigns" className="text-sm text-[#5A5E66] hover:underline">← Campaigns</Link>
      </div>

      {templates.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No templates yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {templates.map((t) => <TemplateCard key={t.id} template={t} />)}
        </div>
      )}

      <CreateTemplateForm />
    </div>
  )
}

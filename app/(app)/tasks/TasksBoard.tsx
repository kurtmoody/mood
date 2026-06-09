'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import {
  TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES, STATUS_COLOUR, PRIORITY_COLOUR,
} from '@/lib/taskConstants'
import { createTaskAction, updateTaskAction, deleteTaskAction, type TaskInput } from '../taskActions'

type Task = {
  id: string
  client_id: string | null
  task_type: string | null
  title: string
  owner_id: string | null
  status: string
  priority: string
  due_date: string | null
  next_action: string | null
  notes: string | null
  clientName: string | null
  clientColour: string | null
  ownerName: string | null
}
type Member = { id: string; full_name: string; user_id: string | null }
type ClientOpt = { id: string; name: string; colour: string }

const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white'
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

function toInput(t: Task): TaskInput {
  return {
    client_id: t.client_id, task_type: t.task_type, title: t.title, owner_id: t.owner_id,
    status: t.status, priority: t.priority, due_date: t.due_date, next_action: t.next_action, notes: t.notes,
  }
}
function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
}
const todayStr = () => new Date().toISOString().slice(0, 10)

function Pill({ value, colour }: { value: string; colour: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ background: colour }} />
      {value}
    </span>
  )
}

// ---- Add/edit modal ----
function TaskModal({ task, members, clients, onClose, onSaved }: {
  task: Task | null
  members: Member[]
  clients: ClientOpt[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<TaskInput>(task ? toInput(task) : {
    client_id: null, task_type: null, title: '', owner_id: null,
    status: 'Not Started', priority: 'Medium', due_date: null, next_action: null, notes: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setPending(true); setError(null)
    const r = task ? await updateTaskAction(task.id, form) : await createTaskAction(form)
    setPending(false)
    if (r.error) { setError(r.error); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white border border-[#ECECEE] rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="text-sm font-semibold mb-4">{task ? 'Edit task' : 'New task'}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Title *</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className={fieldCls} placeholder="What needs doing" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Client</label>
            <select value={form.client_id ?? ''} onChange={(e) => set('client_id', e.target.value || null)} className={fieldCls}>
              <option value="">No client / internal</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Task type</label>
            <select value={form.task_type ?? ''} onChange={(e) => set('task_type', e.target.value || null)} className={fieldCls}>
              <option value="">—</option>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Owner</label>
            <select value={form.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)} className={fieldCls}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Due date</label>
            <input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} className={fieldCls} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={fieldCls}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={fieldCls}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Next action</label>
            <input value={form.next_action ?? ''} onChange={(e) => set('next_action', e.target.value || null)} className={fieldCls} placeholder="The immediate next step" />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={2} className={fieldCls} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex items-center gap-2 mt-4">
          <button onClick={submit} disabled={pending} className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer">
            {pending ? 'Saving…' : task ? 'Save' : 'Create task'}
          </button>
          <button onClick={onClose} className="text-sm text-[#5A5E66] rounded-lg px-3 py-2 hover:bg-[#F4F4F6] cursor-pointer">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function TasksBoard({ tasks, teamMembers, clients, currentUserId, loadError }: {
  tasks: Task[]
  teamMembers: Member[]
  clients: ClientOpt[]
  currentUserId: string
  loadError: boolean
}) {
  const [ownerFilter, setOwnerFilter] = useState<string>('') // '' = all, 'me', or owner_id
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sort, setSort] = useState<'due' | 'priority' | 'status' | 'title'>('due')
  const [modal, setModal] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const myMemberId = useMemo(() => teamMembers.find((m) => m.user_id === currentUserId)?.id ?? null, [teamMembers, currentUserId])
  const today = todayStr()

  const visible = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (ownerFilter === 'me') { if (t.owner_id !== myMemberId) return false }
      else if (ownerFilter && t.owner_id !== ownerFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      return true
    })
    const cmp: Record<typeof sort, (a: Task, b: Task) => number> = {
      due: (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'),
      priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
      status: (a, b) => a.status.localeCompare(b.status),
      title: (a, b) => a.title.localeCompare(b.title),
    }
    return [...filtered].sort(cmp[sort])
  }, [tasks, ownerFilter, statusFilter, sort, myMemberId])

  async function run(id: string, p: Promise<{ error: string | null }>) {
    setBusyId(id); setActionError(null)
    const r = await p
    setBusyId(null)
    if (r.error) setActionError(r.error)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button onClick={() => setModal({ open: true, task: null })} className="bg-[#15171C] text-white rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer">New task</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] cursor-pointer">
          <option value="">All owners</option>
          {myMemberId && <option value="me">My tasks</option>}
          {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] cursor-pointer">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] cursor-pointer">
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
          <option value="title">Sort: Title</option>
        </select>
        <span className="text-xs text-[#9398A1] ml-auto">{visible.length} of {tasks.length}</span>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">⚠️ Couldn&rsquo;t load tasks. Please refresh.</div>
      )}
      {actionError && <div className="mb-4 text-sm text-red-600">{actionError}</div>}

      <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
              <th className="font-semibold px-4 py-2.5">Task</th>
              <th className="font-semibold px-3 py-2.5">Client</th>
              <th className="font-semibold px-3 py-2.5">Type</th>
              <th className="font-semibold px-3 py-2.5">Owner</th>
              <th className="font-semibold px-3 py-2.5">Status</th>
              <th className="font-semibold px-3 py-2.5">Priority</th>
              <th className="font-semibold px-3 py-2.5">Due</th>
              <th className="font-semibold px-3 py-2.5">Next action</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[#9398A1]">No tasks.</td></tr>
            ) : visible.map((t) => {
              const overdue = t.due_date && t.due_date < today && t.status !== 'Complete'
              return (
                <tr key={t.id} className="border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC]">
                  <td className="px-4 py-2.5 font-medium">{t.title}</td>
                  <td className="px-3 py-2.5">
                    {t.clientName ? (
                      <span className="inline-flex items-center gap-1.5 text-[#5A5E66]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.clientColour ?? '#A6ABB3' }} />{t.clientName}</span>
                    ) : <span className="text-[#9398A1]">Internal</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#5A5E66]">{t.task_type ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[#5A5E66]">{t.ownerName ?? <span className="text-[#9398A1]">Unassigned</span>}</td>
                  <td className="px-3 py-2.5"><Pill value={t.status} colour={STATUS_COLOUR[t.status] ?? '#A6ABB3'} /></td>
                  <td className="px-3 py-2.5"><Pill value={t.priority} colour={PRIORITY_COLOUR[t.priority] ?? '#9398A1'} /></td>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${overdue ? 'text-[#E0572E] font-semibold' : 'text-[#5A5E66]'}`}>{fmtDate(t.due_date)}</td>
                  <td className="px-3 py-2.5 text-[#5A5E66] max-w-[200px] truncate">{t.next_action ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      {t.status !== 'Complete' && (
                        <button onClick={() => run(t.id, updateTaskAction(t.id, { ...toInput(t), status: 'Complete' }))} disabled={busyId === t.id} aria-label="Mark complete" title="Mark complete" className="p-1 text-[#9398A1] hover:text-[#16A34A] cursor-pointer disabled:opacity-50"><Check size={15} /></button>
                      )}
                      <button onClick={() => setModal({ open: true, task: t })} aria-label="Edit" className="p-1 text-[#9398A1] hover:text-[#15171C] cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Delete this task?')) run(t.id, deleteTaskAction(t.id)) }} disabled={busyId === t.id} aria-label="Delete" className="p-1 text-[#9398A1] hover:text-[#E0572E] cursor-pointer disabled:opacity-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <TaskModal
          task={modal.task}
          members={teamMembers}
          clients={clients}
          onClose={() => setModal({ open: false, task: null })}
          onSaved={() => setModal({ open: false, task: null })}
        />
      )}
    </div>
  )
}

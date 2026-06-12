'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES, STATUS_COLOUR, PRIORITY_COLOUR } from '@/lib/taskConstants'
import { createTaskAction, updateTaskAction, deleteTaskAction, type TaskInput } from '../taskActions'
import { setViewPreferenceAction } from '../viewPrefActions'
import { fmtTaskDate, taskToday, taskToInput, type Task, type Member, type ClientOpt } from './types'
import { TASK_COLUMNS, TASK_VIEW_KEY } from './columns'
import { mergeColumns, toConfig, type ColumnConfig, type ResolvedColumn } from '@/lib/viewColumns'
import ColumnPicker from '@/components/ColumnPicker'
import InternalNotes from '@/components/InternalNotes'
import TaskKanban from './TaskKanban'
import TaskCalendar from './TaskCalendar'
import { fieldClsSm as fieldCls, btnPrimary, btnGhost } from '@/components/ui'

type Prefill = { contentItemId: string; clientId: string | null; postTitle: string }
type View = 'list' | 'kanban' | 'calendar'
const VIEWS: View[] = ['list', 'kanban', 'calendar']
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
const INVOICE_LABEL: Record<string, string> = { not_invoiced: 'not invoiced', invoiced: 'invoiced', paid: 'paid' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Pill({ value, colour }: { value: string; colour: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ background: colour }} />
      {value}
    </span>
  )
}

// Per-column cell padding/colour. Kept beside the renderer so the column mechanism stays
// self-contained; the Due column reddens when overdue.
function cellCls(key: string, idx: number, overdue: boolean): string {
  const pad = idx === 0 ? 'px-4 py-2.5' : 'px-3 py-2.5'
  if (key === 'due') return `${pad} whitespace-nowrap ${overdue ? 'text-[#E0572E] font-semibold' : 'text-[#5A5E66]'}`
  if (key === 'task_type' || key === 'owner') return `${pad} text-[#5A5E66]`
  if (key === 'next_action') return `${pad} text-[#5A5E66] max-w-[200px] truncate`
  return pad
}

// The cell content for a given column key. Returning null for an unknown key keeps the
// table resilient to a stale saved config.
function taskCell(key: string, t: Task) {
  switch (key) {
    case 'title':
      return (
        <>
          <div className="font-medium">
            {t.title}
            {t.archived && <span className="ml-2 align-middle text-[10px] uppercase tracking-wide font-semibold text-[#9398A1] border border-[#E2E2E5] rounded px-1.5 py-0.5">Archived</span>}
          </div>
          {t.servesPost && (
            t.servesPost.href
              ? <Link href={t.servesPost.href} className="text-xs text-[#5A5E66] hover:underline">↗ {t.servesPost.title}</Link>
              : <span className="text-xs text-[#9398A1]">↗ {t.servesPost.title}</span>
          )}
        </>
      )
    case 'client':
      return t.clientName ? (
        <span className="inline-flex items-center gap-1.5 text-[#5A5E66]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.clientColour ?? '#A6ABB3' }} />{t.clientName}</span>
      ) : <span className="text-[#9398A1]">Internal</span>
    case 'task_type':
      return t.task_type ?? '—'
    case 'owner':
      return t.ownerName ?? <span className="text-[#9398A1]">Unassigned</span>
    case 'status':
      return <Pill value={t.status} colour={STATUS_COLOUR[t.status] ?? '#A6ABB3'} />
    case 'priority':
      return <Pill value={t.priority} colour={PRIORITY_COLOUR[t.priority] ?? '#9398A1'} />
    case 'due':
      // Show a start–due span when a start date is set, else just the due date.
      return t.start_date
        ? `${fmtTaskDate(t.start_date)} – ${fmtTaskDate(t.due_date)}`
        : fmtTaskDate(t.due_date)
    case 'estimate':
      return t.estimated_hours != null ? `${t.estimated_hours}h` : '—'
    case 'value':
      return t.value != null
        ? <span className="whitespace-nowrap">€{t.value} <span className="text-[#9398A1]">· {INVOICE_LABEL[t.invoice_status] ?? t.invoice_status}</span></span>
        : '—'
    case 'next_action':
      return t.next_action ?? '—'
    default:
      return null
  }
}

function TaskModal({ task, seed, servesLabel, members, clients, leadPmByClient, currentUserId, onClose, onSaved }: {
  task: Task | null
  seed?: Partial<TaskInput>
  servesLabel: string | null
  members: Member[]
  clients: ClientOpt[]
  leadPmByClient: Record<string, string | null>
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<TaskInput>(task ? taskToInput(task) : {
    client_id: null, task_type: null, title: '', owner_id: null,
    status: 'Not Started', priority: 'Medium', due_date: null, next_action: null, notes: null,
    content_item_id: null, estimated_hours: null, start_date: null,
    value: null, value_client_visible: false, invoice_status: 'not_invoiced', ...seed,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  function onClientChange(clientId: string | null) {
    setForm((f) => ({ ...f, client_id: clientId, owner_id: clientId ? leadPmByClient[clientId] ?? null : f.owner_id }))
  }
  async function submit() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setPending(true); setError(null)
    const r = task ? await updateTaskAction(task.id, form) : await createTaskAction(form)
    setPending(false)
    if (r.error) { setError(r.error); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={task ? 'Edit task' : 'New task'}>
      <div className="absolute inset-0 bg-black/20 animate-overlay-in" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white border border-[#ECECEE] rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto animate-pop-in">
        <div className="text-sm font-semibold mb-1">{task ? 'Edit task' : 'New task'}</div>
        {servesLabel && <div className="text-xs text-[#9398A1] mb-3">Serves post: <span className="text-[#5A5E66]">{servesLabel}</span></div>}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Title *</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className={fieldCls} placeholder="What needs doing" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Client</label>
            <select value={form.client_id ?? ''} onChange={(e) => onClientChange(e.target.value || null)} className={fieldCls}>
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
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Start date</label>
            <input type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} className={fieldCls} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Due date</label>
            <input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} className={fieldCls} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Estimated hours</label>
            <input type="number" step="0.5" min="0" value={form.estimated_hours ?? ''} onChange={(e) => set('estimated_hours', e.target.value === '' ? null : Number(e.target.value))} className={fieldCls} placeholder="e.g. 3" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Value (€)</label>
            <input type="number" step="0.01" min="0" value={form.value ?? ''} onChange={(e) => set('value', e.target.value === '' ? null : Number(e.target.value))} className={fieldCls} placeholder="e.g. 500" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Invoice status</label>
            <select value={form.invoice_status} onChange={(e) => set('invoice_status', e.target.value)} className={fieldCls}>
              <option value="not_invoiced">Not invoiced</option>
              <option value="invoiced">Invoiced</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-[#5A5E66]">
              <input type="checkbox" checked={form.value_client_visible} onChange={(e) => set('value_client_visible', e.target.checked)} />
              Value visible to client
            </label>
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
        {task && (
          <div className="mt-4">
            <InternalNotes parentType="task" parentId={task.id} currentUserId={currentUserId} />
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex items-center gap-2 mt-4">
          <button onClick={submit} disabled={pending} className={btnPrimary}>
            {pending ? 'Saving…' : task ? 'Save' : 'Create task'}
          </button>
          <button onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

type ModalState = { open: boolean; task: Task | null; seed?: Partial<TaskInput>; servesLabel: string | null }

export default function TasksBoard({ tasks, teamMembers, clients, leadPmByClient, currentUserId, loadError, prefill, initialView, initialOwner, initialStatus, initialClient, savedColumns }: {
  tasks: Task[]
  teamMembers: Member[]
  clients: ClientOpt[]
  leadPmByClient: Record<string, string | null>
  currentUserId: string
  loadError: boolean
  prefill: Prefill | null
  initialView: View
  initialOwner: string
  initialStatus: string
  initialClient: string
  savedColumns: ColumnConfig[] | null
}) {
  const router = useRouter()
  const [view, setViewState] = useState<View>(initialView)
  const [ownerFilter, setOwnerFilter] = useState<string>(initialOwner)
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus)
  const [clientFilter, setClientFilter] = useState<string>(initialClient)
  const [sort, setSort] = useState<'due' | 'priority' | 'status' | 'title'>('due')
  const [showArchived, setShowArchived] = useState(false)
  const hasArchived = tasks.some((t) => t.archived)
  const [modal, setModal] = useState<ModalState>(() =>
    prefill
      ? { open: true, task: null, servesLabel: prefill.postTitle, seed: { content_item_id: prefill.contentItemId, client_id: prefill.clientId, owner_id: prefill.clientId ? leadPmByClient[prefill.clientId] ?? null : null } }
      : { open: false, task: null, servesLabel: null },
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Column preferences: merge the saved config with the current column set so a newly
  // added column defaults to visible rather than vanishing for existing users.
  const [columns, setColumns] = useState<ResolvedColumn[]>(() => mergeColumns(TASK_COLUMNS, savedColumns))
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns])
  async function onColumnsChange(next: ResolvedColumn[]) {
    setColumns(next)
    const r = await setViewPreferenceAction(TASK_VIEW_KEY, toConfig(next))
    if (r.error) setActionError(r.error)
  }

  // Local copy for optimistic kanban moves; re-syncs whenever the server data changes.
  const [localTasks, setLocalTasks] = useState(tasks)
  const syncKey = tasks.map((t) => `${t.id}:${t.status}`).join('|')
  useEffect(() => { setLocalTasks(tasks) }, [syncKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // View + filters mirrored to the URL (shareable/refresh-safe) without a server re-fetch.
  // Two-way: seeded from ?view/?owner/?status/?client, and written back on any change.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    sp.set('view', view)
    ownerFilter ? sp.set('owner', ownerFilter) : sp.delete('owner')
    statusFilter ? sp.set('status', statusFilter) : sp.delete('status')
    clientFilter ? sp.set('client', clientFilter) : sp.delete('client')
    const qs = sp.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [view, ownerFilter, statusFilter, clientFilter])

  const myMemberId = useMemo(() => teamMembers.find((m) => m.user_id === currentUserId)?.id ?? null, [teamMembers, currentUserId])
  const today = taskToday()

  const visible = useMemo(() => {
    const filtered = localTasks.filter((t) => {
      if (t.archived && !showArchived) return false
      if (ownerFilter === 'me') { if (t.owner_id !== myMemberId) return false }
      else if (ownerFilter && t.owner_id !== ownerFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (clientFilter === 'internal') { if (t.client_id !== null) return false }
      else if (clientFilter && t.client_id !== clientFilter) return false
      return true
    })
    const cmp: Record<typeof sort, (a: Task, b: Task) => number> = {
      due: (a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'),
      priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
      status: (a, b) => a.status.localeCompare(b.status),
      title: (a, b) => a.title.localeCompare(b.title),
    }
    return [...filtered].sort(cmp[sort])
  }, [localTasks, ownerFilter, statusFilter, clientFilter, sort, myMemberId, showArchived])

  async function run(id: string, p: Promise<{ error: string | null }>) {
    setBusyId(id); setActionError(null)
    const r = await p
    setBusyId(null)
    if (r.error) setActionError(r.error)
  }

  // Kanban move: optimistic, persisted via update_task; revert (re-fetch) on error.
  async function onMove(task: Task, status: string) {
    setActionError(null)
    setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
    const r = await updateTaskAction(task.id, { ...taskToInput(task), status })
    if (r.error) { setActionError(r.error); router.refresh() }
  }

  function openEdit(t: Task) { setModal({ open: true, task: t, servesLabel: t.servesPost?.title ?? null }) }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <div className="inline-flex rounded-lg border border-[#E2E2E5] overflow-hidden text-sm">
            {VIEWS.map((v) => (
              <button key={v} onClick={() => setViewState(v)} className={`px-3 py-1.5 cursor-pointer ${view === v ? 'bg-[#15171C] text-white font-semibold' : 'text-[#5A5E66] hover:bg-[#F4F4F6]'}`}>{cap(v)}</button>
            ))}
          </div>
        </div>
        <button onClick={() => setModal({ open: true, task: null, servesLabel: null })} className={btnPrimary}>New task</button>
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
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] cursor-pointer">
          <option value="">All clients</option>
          <option value="internal">Internal</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {view === 'list' && (
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-[#E2E2E5] px-3 py-2 text-sm text-[#5A5E66] cursor-pointer">
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="status">Sort: Status</option>
            <option value="title">Sort: Title</option>
          </select>
        )}
        {hasArchived && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm cursor-pointer ${
              showArchived ? 'bg-[#15171C] text-white border-[#15171C] font-medium' : 'border-[#E2E2E5] text-[#5A5E66] hover:bg-[#F4F4F6]'
            }`}
          >
            Show archived
          </button>
        )}
        <span className="text-xs text-[#9398A1] ml-auto">{visible.length} of {localTasks.length}</span>
        {view === 'list' && <ColumnPicker columns={columns} onChange={onColumnsChange} />}
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#E0572E]/30 bg-[#E0572E]/5 px-4 py-2.5 text-sm text-[#E0572E]">⚠️ Couldn&rsquo;t load tasks. Please refresh.</div>
      )}
      {actionError && <div className="mb-4 text-sm text-red-600">{actionError}</div>}

      {view === 'kanban' ? (
        <TaskKanban tasks={visible} onMove={onMove} onEdit={openEdit} />
      ) : view === 'calendar' ? (
        <TaskCalendar tasks={visible} onEdit={openEdit} />
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
                {visibleColumns.map((c, i) => (
                  <th key={c.key} className={`font-semibold py-2.5 ${i === 0 ? 'px-4' : 'px-3'}`}>{c.label}</th>
                ))}
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-[#9398A1]">No tasks.</td></tr>
              ) : visible.map((t) => {
                const overdue = !!(t.due_date && t.due_date < today && t.status !== 'Complete')
                return (
                  <tr key={t.id} className={`border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC] ${t.archived ? 'opacity-60' : ''}`}>
                    {visibleColumns.map((c, i) => (
                      <td key={c.key} className={cellCls(c.key, i, overdue)}>{taskCell(c.key, t)}</td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {t.status !== 'Complete' && (
                          <button onClick={() => run(t.id, updateTaskAction(t.id, { ...taskToInput(t), status: 'Complete' }))} disabled={busyId === t.id} aria-label="Mark complete" title="Mark complete" className="p-1 text-[#9398A1] hover:text-[#16A34A] cursor-pointer disabled:opacity-50"><Check size={15} /></button>
                        )}
                        <button onClick={() => openEdit(t)} aria-label="Edit" className="p-1 text-[#9398A1] hover:text-[#15171C] cursor-pointer"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm('Delete this task?')) run(t.id, deleteTaskAction(t.id)) }} disabled={busyId === t.id} aria-label="Delete" className="p-1 text-[#9398A1] hover:text-[#E0572E] cursor-pointer disabled:opacity-50"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <TaskModal
          task={modal.task}
          seed={modal.seed}
          servesLabel={modal.servesLabel}
          members={teamMembers}
          clients={clients}
          leadPmByClient={leadPmByClient}
          currentUserId={currentUserId}
          onClose={() => setModal({ open: false, task: null, servesLabel: null })}
          onSaved={() => setModal({ open: false, task: null, servesLabel: null })}
        />
      )}
    </div>
  )
}

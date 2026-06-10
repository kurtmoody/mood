'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  startTimerAction, stopTimerAction, logTimeAction, updateTimeEntryAction, deleteTimeEntryAction,
} from '@/app/(app)/clients/[id]/timesheetActions'

type Entry = {
  id: string
  task_id: string | null
  user_id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  note: string | null
}
type Running = { id: string; client_id: string; started_at: string }
type TaskOpt = { id: string; title: string }

const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white'
const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'

const pad = (n: number) => String(n).padStart(2, '0')
function isoToLocalInput(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const nowLocalInput = () => isoToLocalInput(new Date().toISOString())
const localToISO = (v: string): string | null => (v ? new Date(v).toISOString() : null)
function fmtDT(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtDur(min: number | null) {
  if (min == null) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Agency-only internal time logging for a client: a DB-backed timer (survives refresh) +
// manual entries + a list with owner edit/delete. Reads are RLS-scoped (agency-only).
export default function TimesheetSection({ clientId, currentUserId }: { clientId: string; currentUserId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tasks, setTasks] = useState<TaskOpt[]>([])
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<Running | null>(null) // the caller's open timer (any client)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: es }, { data: ts }, { data: team }, { data: run }] = await Promise.all([
      supabase.from('time_entry').select('id, task_id, user_id, started_at, ended_at, duration_minutes, note')
        .eq('client_id', clientId).order('started_at', { ascending: false }),
      supabase.from('task').select('id, title').eq('client_id', clientId).order('title'),
      supabase.from('team_member').select('user_id, full_name'),
      supabase.from('time_entry').select('id, client_id, started_at').eq('user_id', currentUserId).is('ended_at', null).maybeSingle(),
    ])
    setEntries((es as Entry[]) ?? [])
    setTasks((ts as TaskOpt[]) ?? [])
    const map: Record<string, string> = {}
    for (const t of team ?? []) if ((t as any).user_id) map[(t as any).user_id] = (t as any).full_name
    setNameByUser(map)
    setRunning((run as Running) ?? null)
  }, [clientId, currentUserId])

  useEffect(() => { load() }, [load])

  // Live tick while a timer for THIS client is running.
  const runningHere = running && running.client_id === clientId
  useEffect(() => {
    if (!runningHere) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [runningHere])

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setError(null)
    const r = await fn()
    setBusy(false)
    if (r.error) { setError(r.error); return false }
    await load()
    return true
  }

  const taskTitle = (id: string | null) => (id ? tasks.find((t) => t.id === id)?.title ?? '(task)' : null)

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-1">Timesheet</div>
      <div className="text-xs text-[#9398A1] mb-4">Internal time logging — never shown to the client.</div>
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      <Timer
        clientId={clientId}
        running={running}
        runningHere={!!runningHere}
        elapsedMs={runningHere ? now - new Date(running!.started_at).getTime() : 0}
        tasks={tasks}
        busy={busy}
        onStart={(taskId, note) => run(() => startTimerAction(clientId, taskId, note))}
        onStop={(endISO) => run(() => stopTimerAction(running!.id, endISO))}
      />

      <ManualForm
        tasks={tasks}
        busy={busy}
        onLog={(taskId, startISO, endISO, note) => run(() => logTimeAction(clientId, taskId, startISO, endISO, note))}
      />

      <div className="mt-5 border-t border-[#ECECEE] pt-4">
        <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Entries</div>
        {entries.length === 0 ? (
          <div className="text-sm text-[#9398A1]">No time logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
                  <th className="font-semibold px-2 py-2">Person</th>
                  <th className="font-semibold px-2 py-2">Task / note</th>
                  <th className="font-semibold px-2 py-2">Start</th>
                  <th className="font-semibold px-2 py-2">End</th>
                  <th className="font-semibold px-2 py-2">Total</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <EntryRow
                    key={e.id} e={e} mine={e.user_id === currentUserId}
                    personName={nameByUser[e.user_id] ?? 'Unknown'} taskTitle={taskTitle(e.task_id)}
                    tasks={tasks} busy={busy}
                    onSave={(taskId, startISO, endISO, note) => run(() => updateTimeEntryAction(e.id, taskId, startISO, endISO, note))}
                    onDelete={() => run(() => deleteTimeEntryAction(e.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Timer({ clientId, running, runningHere, elapsedMs, tasks, busy, onStart, onStop }: {
  clientId: string
  running: Running | null
  runningHere: boolean
  elapsedMs: number
  tasks: TaskOpt[]
  busy: boolean
  onStart: (taskId: string | null, note: string | null) => void
  onStop: (endISO: string | null) => void
}) {
  const [taskId, setTaskId] = useState('')
  const [note, setNote] = useState('')
  const [stopping, setStopping] = useState(false)
  const [endVal, setEndVal] = useState('')

  if (runningHere) {
    const s = Math.floor(elapsedMs / 1000)
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60
    return (
      <div className="rounded-xl border border-[#16A34A]/30 bg-[#16A34A]/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">Timer running · <span className="font-mono font-semibold">{pad(hh)}:{pad(mm)}:{pad(ss)}</span></div>
          {!stopping && (
            <button onClick={() => { setEndVal(nowLocalInput()); setStopping(true) }} disabled={busy}
              className="bg-[#15171C] text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50">Stop</button>
          )}
        </div>
        {stopping && (
          <div className="flex items-end gap-2 mt-3">
            <div><label className={labelCls}>End time</label><input type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} className={fieldCls} /></div>
            <button onClick={() => onStop(localToISO(endVal))} disabled={busy} className="bg-[#15171C] text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => setStopping(false)} className="text-sm text-[#5A5E66] px-3 py-1.5 hover:bg-[#F4F4F6] rounded-lg">Cancel</button>
          </div>
        )}
      </div>
    )
  }

  if (running && running.client_id !== clientId) {
    return <div className="rounded-xl border border-[#E8920C]/30 bg-[#E8920C]/5 p-4 text-sm text-[#8A6D1F]">You have a running timer on another client — stop it before starting one here.</div>
  }

  return (
    <div className="rounded-xl border border-[#ECECEE] bg-[#FBFBFC] p-4">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[160px]">
          <label className={labelCls}>Task (optional)</label>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={fieldCls}>
            <option value="">No task</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className={labelCls}>Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} placeholder="What are you working on?" />
        </div>
        <button onClick={() => onStart(taskId || null, note.trim() || null)} disabled={busy}
          className="bg-[#16A34A] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">Start timer</button>
      </div>
    </div>
  )
}

function ManualForm({ tasks, busy, onLog }: {
  tasks: TaskOpt[]
  busy: boolean
  onLog: (taskId: string | null, startISO: string, endISO: string, note: string | null) => void
}) {
  const [taskId, setTaskId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)

  function submit() {
    const s = localToISO(start), e = localToISO(end)
    if (!s || !e) { setLocalErr('Start and end are required.'); return }
    if (new Date(e) <= new Date(s)) { setLocalErr('End must be after start.'); return }
    setLocalErr(null)
    onLog(taskId || null, s, e, note.trim() || null)
    setStart(''); setEnd(''); setNote(''); setTaskId('')
  }

  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Log time manually</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Task (optional)</label>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={fieldCls}>
            <option value="">No task</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Start</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>End</label>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} />
        </div>
      </div>
      {localErr && <p className="text-sm text-red-600 mt-2">{localErr}</p>}
      <button onClick={submit} disabled={busy} className="mt-3 bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">Log time</button>
    </div>
  )
}

function EntryRow({ e, mine, personName, taskTitle, tasks, busy, onSave, onDelete }: {
  e: Entry
  mine: boolean
  personName: string
  taskTitle: string | null
  tasks: TaskOpt[]
  busy: boolean
  onSave: (taskId: string | null, startISO: string, endISO: string | null, note: string | null) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [taskId, setTaskId] = useState(e.task_id ?? '')
  const [start, setStart] = useState(isoToLocalInput(e.started_at))
  const [end, setEnd] = useState(e.ended_at ? isoToLocalInput(e.ended_at) : '')
  const [note, setNote] = useState(e.note ?? '')

  if (editing) {
    return (
      <tr className="border-b border-[#ECECEE] bg-[#FBFBFC]">
        <td className="px-2 py-2 align-top">{personName}</td>
        <td className="px-2 py-2 align-top" colSpan={4}>
          <div className="grid grid-cols-2 gap-2">
            <select value={taskId} onChange={(ev) => setTaskId(ev.target.value)} className={fieldCls}>
              <option value="">No task</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input value={note} onChange={(ev) => setNote(ev.target.value)} className={fieldCls} placeholder="Note" />
            <input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} className={fieldCls} />
            <input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} className={fieldCls} />
          </div>
        </td>
        <td className="px-2 py-2 align-top whitespace-nowrap">
          <button
            onClick={() => onSave(taskId || null, localToISO(start)!, localToISO(end), note.trim() || null)}
            disabled={busy || !start}
            className="text-xs font-semibold bg-[#15171C] text-white rounded-md px-2.5 py-1 disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-[#5A5E66] ml-2 hover:underline">Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC]">
      <td className="px-2 py-2">{personName}</td>
      <td className="px-2 py-2 text-[#5A5E66]">{taskTitle ?? e.note ?? <span className="text-[#9398A1]">—</span>}</td>
      <td className="px-2 py-2 text-[#5A5E66] whitespace-nowrap">{fmtDT(e.started_at)}</td>
      <td className="px-2 py-2 text-[#5A5E66] whitespace-nowrap">{e.ended_at ? fmtDT(e.ended_at) : <span className="text-[#16A34A]">running</span>}</td>
      <td className="px-2 py-2 whitespace-nowrap">{fmtDur(e.duration_minutes)}</td>
      <td className="px-2 py-2 whitespace-nowrap text-right">
        {mine && e.ended_at && (
          <>
            <button onClick={() => setEditing(true)} className="text-xs text-[#5A5E66] hover:underline">Edit</button>
            <button onClick={() => { if (confirm('Delete this time entry?')) onDelete() }} className="text-xs text-[#5A5E66] hover:text-[#E0572E] hover:underline ml-2">Delete</button>
          </>
        )}
      </td>
    </tr>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { maltaInputToISO } from '@/lib/week'
import { OPEN_STATUSES } from '@/lib/taskConstants'
import { logTimeAction, createTaskAndLogTimeAction } from '@/app/(app)/timeLogActions'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

type ClientOpt = { id: string; name: string }
type TaskOpt = { id: string; title: string }

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Global time-logging modal (agency-only). Reads are browser-side + RLS-scoped, mirroring
// TimesheetSection. The Job field is one combobox: pick an open task → link it, or type
// free text → unattributed time (note). Datetime inputs are Malta wall-clock, converted
// to UTC via maltaInputToISO before the RPC.
export default function LogTimeModal({ onClose, onLogged }: { onClose: () => void; onLogged: () => void }) {
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [clientId, setClientId] = useState('')
  const [tasks, setTasks] = useState<TaskOpt[]>([])
  const [jobText, setJobText] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [showList, setShowList] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const blurT = useRef<number | null>(null)

  // Portal-gate: only render into document.body on the client (avoids SSR mismatch).
  useEffect(() => { setMounted(true) }, [])

  // Escape closes; clean up the blur timer on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (blurT.current) clearTimeout(blurT.current)
    }
  }, [onClose])

  // Timesheet-enabled clients (RLS-scoped to the agency), on open.
  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data, error } = await supabase.from('client').select('id, name').eq('timesheet_enabled', true).order('name')
      if (!active) return
      if (error) {
        console.error('LogTimeModal: load clients', error)
        setLoadError(`Could not load clients — ${error.message}`)
        return
      }
      setClients((data as ClientOpt[]) ?? [])
    })()
    return () => { active = false }
  }, [])

  // Selected client's OPEN tasks for the Job combobox.
  useEffect(() => {
    setJobText(''); setTaskId(null); setCreateMode(false); setTasks([])
    if (!clientId) return
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data, error } = await supabase
        .from('task')
        .select('id, title')
        .eq('client_id', clientId)
        .in('status', [...OPEN_STATUSES])
        .order('title')
      if (!active) return
      if (error) {
        console.error('LogTimeModal: load tasks', error)
        setLoadError(`Could not load tasks — ${error.message}`)
        return
      }
      setTasks((data as TaskOpt[]) ?? [])
    })()
    return () => { active = false }
  }, [clientId])

  const filtered = useMemo(() => {
    const q = jobText.trim().toLowerCase()
    return q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
  }, [tasks, jobText])

  // Offer "create task" only when the typed text is non-empty and matches no existing open
  // task (case-insensitive) — so it's an explicit choice, never the free-text default.
  const trimmedJob = jobText.trim()
  const canCreate = !!clientId && trimmedJob.length > 0 &&
    !tasks.some((t) => t.title.toLowerCase() === trimmedJob.toLowerCase())

  const duration = useMemo(() => {
    if (!start || !end) return null
    const s = new Date(maltaInputToISO(start)).getTime()
    const e = new Date(maltaInputToISO(end)).getTime()
    if (!(e > s)) return null
    return fmtDuration(Math.round((e - s) / 60000))
  }, [start, end])

  function pickTask(t: TaskOpt) {
    setTaskId(t.id); setCreateMode(false); setJobText(t.title); setShowList(false)
  }
  function startCreate() {
    setCreateMode(true); setTaskId(null); setShowList(false)
  }

  async function submit() {
    if (!clientId) { setLocalErr('Choose a client.'); return }
    if (!start || !end) { setLocalErr('Start and end are required.'); return }
    const startISO = maltaInputToISO(start)
    const endISO = maltaInputToISO(end)
    if (new Date(endISO) <= new Date(startISO)) { setLocalErr('End must be after start.'); return }

    setLocalErr(null); setError(null); setSubmitting(true)
    let r: { error: string | null }
    if (createMode) {
      // Create the task first, then log against it (title is the label, no note).
      r = await createTaskAndLogTimeAction(clientId, trimmedJob, startISO, endISO)
    } else {
      // Linked task → no note; free text → note carries it (unattributed time).
      const note = taskId ? null : (trimmedJob || null)
      r = await logTimeAction(clientId, taskId, startISO, endISO, note)
    }
    setSubmitting(false)
    if (r.error) { setError(r.error); return }
    onLogged()
  }

  if (!mounted) return null

  // Portal to <body> so the fixed overlay escapes AppShell's transformed content wrapper
  // (a transform/transition ancestor would otherwise become the containing block and clip it).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 px-4 pt-20 pb-8 animate-overlay-in"
      role="dialog"
      aria-modal="true"
      aria-label="Log time"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-white border border-[#ECECEE] rounded-2xl shadow-xl animate-pop-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECEE]">
          <h2 className="text-base font-bold">Log time</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer">✕</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          <div>
            <label className={labelCls}>Client *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={fieldCls}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="relative">
            <label className={labelCls}>Job</label>
            <input
              value={jobText}
              disabled={!clientId}
              onChange={(e) => { setJobText(e.target.value); setTaskId(null); setCreateMode(false); setShowList(true) }}
              onFocus={() => setShowList(true)}
              onBlur={() => { blurT.current = window.setTimeout(() => setShowList(false), 150) }}
              className={`${fieldCls} disabled:bg-[#F4F4F6] disabled:text-[#9398A1]`}
              placeholder={clientId ? 'Pick a task or type a note' : 'Choose a client first'}
            />
            {taskId && <span className="absolute right-3 top-[30px] text-[11px] text-[#16A34A] font-medium">Linked task</span>}
            {createMode && <span className="absolute right-3 top-[30px] text-[11px] text-[#3B82F6] font-medium">New task</span>}
            {showList && clientId && (filtered.length > 0 || canCreate) && (
              <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-[#ECECEE] rounded-xl shadow-lg z-10 p-1">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickTask(t) }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm hover:bg-[#F4F4F6] cursor-pointer"
                  >
                    {t.title}
                  </button>
                ))}
                {canCreate && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); startCreate() }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-[#3B82F6] hover:bg-[#F4F4F6] cursor-pointer ${filtered.length > 0 ? 'border-t border-[#ECECEE] mt-1 pt-2' : ''}`}
                  >
                    Create task &ldquo;{trimmedJob}&rdquo;
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-[#9398A1] mt-1">Pick a task to link it, create a new one, or type free text to log unattributed time.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start *</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>End *</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} />
            </div>
          </div>

          <div className="text-sm text-[#5A5E66]">
            Duration: <span className="font-semibold text-[#15171C]">{duration ?? '—'}</span>
          </div>

          {localErr && <p className="text-sm text-red-600">{localErr}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-[#ECECEE] flex items-center gap-3">
          <button onClick={submit} disabled={submitting} className={btnPrimary}>
            {submitting ? 'Logging…' : createMode ? 'Create task & log' : 'Log time'}
          </button>
          <button onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

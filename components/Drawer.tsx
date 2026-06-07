'use client'

import { useActionState, useEffect, useRef } from 'react'
import { STATUS, type Item } from './Calendar'

type TransitionState = { error: string | null; ok: boolean }
type TransitionAction = (prev: TransitionState, fd: FormData) => Promise<TransitionState>

// Actions available from each status (key → button label).
const ACTIONS: Record<string, { action: string; label: string }[]> = {
  draft: [{ action: 'submit_internal', label: 'Submit for internal review' }],
  internal_review: [
    { action: 'approve_internal', label: 'Approve & send to client' },
    { action: 'request_changes', label: 'Request changes' },
  ],
  client_review: [
    { action: 'approve', label: 'Mark client-approved' },
    { action: 'request_changes', label: 'Request changes' },
  ],
  changes_requested: [{ action: 'submit_internal', label: 'Resubmit for internal review' }],
  approved: [{ action: 'schedule', label: 'Mark scheduled' }],
  scheduled: [{ action: 'mark_posted', label: 'Mark posted' }],
  posted: [],
}

// Past-tense labels for the history log.
const ACTION_PAST: Record<string, string> = {
  submit_internal: 'Submitted for internal review',
  approve_internal: 'Approved & sent to client',
  request_changes: 'Requested changes',
  approve: 'Client-approved',
  schedule: 'Scheduled',
  mark_posted: 'Posted',
}

function formatDate(iso: string | null) {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const initial: TransitionState = { error: null, ok: false }

export default function Drawer({
  item,
  onClose,
  transitionAction,
}: {
  item: Item | null
  onClose: () => void
  transitionAction: TransitionAction
}) {
  const [state, action, pending] = useActionState(transitionAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  useEffect(() => { if (state.ok) formRef.current?.reset() }, [state.ok])

  if (!item) return null

  const s = STATUS[item.status] ?? STATUS.draft
  const channel = item.channel?.label ?? item.channel?.type ?? item.content_type
  const actions = ACTIONS[item.status] ?? []
  const events = item.events ?? []

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[#ECECEE]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold capitalize mb-1">{channel}</div>
            <h2 className="text-lg font-bold leading-snug">{item.title ?? 'Untitled'}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Scheduled</div>
              <div className="text-sm">{formatDate(item.scheduled_at)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">Status</div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                {s.label}
              </div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Body</div>
          {item.body
            ? <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#15171C]">{item.body}</div>
            : <div className="text-sm text-[#9398A1] italic">No content yet.</div>}

          {actions.length > 0 && (
            <form ref={formRef} action={action} className="mt-7 pt-5 border-t border-[#ECECEE]">
              <input type="hidden" name="item_id" value={item.id} />
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Move forward</div>
              <textarea
                name="note"
                rows={2}
                placeholder="Add a note (required when requesting changes)"
                className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white mb-3"
              />
              <div className="flex flex-wrap gap-2">
                {actions.map(({ action: a, label }) => {
                  const danger = a === 'request_changes'
                  return (
                    <button
                      key={a}
                      type="submit"
                      name="action"
                      value={a}
                      disabled={pending}
                      className={`rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50 ${
                        danger
                          ? 'border border-[#E0572E] text-[#E0572E] hover:bg-[#E0572E]/5'
                          : 'bg-[#15171C] text-white'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
            </form>
          )}

          {events.length > 0 && (
            <div className="mt-7 pt-5 border-t border-[#ECECEE]">
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">History</div>
              <ol className="flex flex-col gap-3">
                {events.map((ev) => (
                  <li key={ev.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">
                        {ACTION_PAST[ev.action] ?? ev.action}
                        {ev.actor && <span className="font-normal text-[#5A5E66]"> by {ev.actor}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-[#9398A1]">{formatShort(ev.created_at)}</span>
                    </div>
                    {ev.note && <div className="text-[13px] text-[#5A5E66] mt-0.5">{ev.note}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

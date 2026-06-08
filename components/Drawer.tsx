'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { STATUS, type Item } from './Calendar'
import MediaSection from './MediaSection'
import VersionHistory from './VersionHistory'

type ActionState = { error: string | null; ok: boolean }
type ActionFn = (prev: ActionState, fd: FormData) => Promise<ActionState>
type Channel = { id: string; type: string; label: string | null }

// A post is editable by agency only before it reaches the client.
const EDITABLE = new Set(['draft', 'internal_review', 'changes_requested'])

// Shown before editing a frozen (client-facing) post — editing forks a new version.
const FORK_WARNING =
  'This post has been sent to the client. Editing it will create a new version and return it to internal review for re-approval. Continue?'

// Convert an ISO instant to a datetime-local value ('YYYY-MM-DDTHH:mm') in local time.
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function channelLabel(c: Channel) {
  return c.label ? `${c.label} (${cap(c.type)})` : cap(c.type)
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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

// Client-facing labels for the two actions a client may take (agency labels unchanged).
const CLIENT_ACTION_LABELS: Record<string, string> = {
  approve: 'Approve',
  request_changes: 'Request changes',
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

const initial: ActionState = { error: null, ok: false }

function AddCommentForm({ itemId, action }: { itemId: string; action: ActionFn }) {
  const [state, formAction, pending] = useActionState(action, initial)
  const [body, setBody] = useState('')
  useEffect(() => { if (state.ok) setBody('') }, [state.ok])

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="item_id" value={itemId} />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a comment"
        className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white"
      />
      {state.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}
      <div className="mt-2">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="bg-[#15171C] text-white rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </form>
  )
}

function CommentDeleteButton({ commentId, action }: { commentId: string; action: ActionFn }) {
  const [state, formAction, pending] = useActionState(action, initial)
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!confirm('Delete this comment?')) e.preventDefault() }}
      className="mt-1"
    >
      <input type="hidden" name="comment_id" value={commentId} />
      <button type="submit" disabled={pending} className="text-[12px] text-[#E0572E] hover:underline disabled:opacity-50">
        Delete
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

const labelCls = 'block text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1'
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white'

function EditPostForm({
  item,
  channels,
  action,
  onCancel,
  isFork,
}: {
  item: Item
  channels: Channel[]
  action: ActionFn
  onCancel: () => void
  isFork: boolean
}) {
  const [state, formAction, pending] = useActionState(action, initial)
  const [when, setWhen] = useState(() => (item.scheduled_at ? toLocalInput(item.scheduled_at) : ''))
  useEffect(() => { if (state.ok) onCancel() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  const iso = when ? new Date(when).toISOString() : ''

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="item_id" value={item.id} />
      <input type="hidden" name="scheduled_at" value={iso} />
      {isFork && (
        <div className="text-[13px] text-[#9C5A00] bg-[#E8920C]/10 border border-[#E8920C]/25 rounded-lg px-3 py-2">
          Saving creates a new version and returns this post to internal review for re-approval.
        </div>
      )}
      <div>
        <label className={labelCls}>Title</label>
        <input name="title" defaultValue={item.title ?? ''} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Channel</label>
        <select name="channel_id" defaultValue={item.channel_id ?? ''} className={fieldCls}>
          <option value="">No channel</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{channelLabel(c)}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Scheduled date &amp; time</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Caption</label>
        <textarea name="body" rows={6} defaultValue={item.body ?? ''} className={fieldCls} />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-[#15171C] text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-[#5A5E66] rounded-lg px-3 py-2.5 hover:bg-[#F4F4F6]">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Drawer({
  item,
  onClose,
  transitionAction,
  updatePostAction,
  addCommentAction,
  deleteCommentAction,
  channels,
  clientId,
  currentUserId,
  isAgency,
}: {
  item: Item | null
  onClose: () => void
  transitionAction: ActionFn
  updatePostAction: ActionFn
  addCommentAction: ActionFn
  deleteCommentAction: ActionFn
  channels: Channel[]
  clientId: string
  currentUserId: string
  isAgency: boolean
}) {
  const [state, action, pending] = useActionState(transitionAction, initial)
  const [editing, setEditing] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  useEffect(() => { if (state.ok) formRef.current?.reset() }, [state.ok])

  // Reset edit mode when a different post is opened (or the drawer closes).
  useEffect(() => { setEditing(false) }, [item?.id])

  if (!item) return null

  const s = STATUS[item.status] ?? STATUS.draft
  const channel = item.channel?.label ?? item.channel?.type ?? item.content_type
  const actions = ACTIONS[item.status] ?? []
  // Agency: all valid transitions for the status. Client: only approve /
  // request_changes, and only on a client_review post — never any agency transition.
  const visibleActions = isAgency
    ? actions
    : item.status === 'client_review'
      ? actions
          .filter((a) => a.action === 'approve' || a.action === 'request_changes')
          .map((a) => ({ action: a.action, label: CLIENT_ACTION_LABELS[a.action] ?? a.label }))
      : []
  const events = item.events ?? []
  const comments = item.comments ?? []
  const editableInPlace = isAgency && EDITABLE.has(item.status)   // mutable: edit in place
  const editableAsFork = isAgency && !EDITABLE.has(item.status)   // frozen: edit forks a new version

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[#ECECEE]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold capitalize mb-1">{channel}</div>
            <h2 className="text-lg font-bold leading-snug">{item.title ?? 'Untitled'}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && editableInPlace && (
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 h-8 grid place-items-center rounded-lg text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
              >
                Edit
              </button>
            )}
            {!editing && editableAsFork && (
              <button
                onClick={() => { if (window.confirm(FORK_WARNING)) setEditing(true) }}
                className="px-2.5 h-8 grid place-items-center rounded-lg text-sm text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
              >
                Edit (new version)
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {editing ? (
            <EditPostForm item={item} channels={channels} action={updatePostAction} onCancel={() => setEditing(false)} isFork={editableAsFork} />
          ) : (
          <>
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
                {item.version_no ? <span className="text-[#9398A1]">· v{item.version_no}</span> : null}
              </div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Body</div>
          {item.body
            ? <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#15171C]">{item.body}</div>
            : <div className="text-sm text-[#9398A1] italic">No content yet.</div>}

          <MediaSection
            media={item.media ?? []}
            isAgency={isAgency}
            clientId={clientId}
            contentItemId={item.id}
            versionId={item.current_version_id}
          />

          {visibleActions.length > 0 && (
            <form ref={formRef} action={action} className="mt-7 pt-5 border-t border-[#ECECEE]">
              <input type="hidden" name="item_id" value={item.id} />
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">{isAgency ? 'Move forward' : 'Your review'}</div>
              <textarea
                name="note"
                rows={2}
                placeholder={isAgency ? 'Add a note (required when requesting changes)' : 'Add a note (required if requesting changes)'}
                className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white mb-3"
              />
              <div className="flex flex-wrap gap-2">
                {visibleActions.map(({ action: a, label }) => {
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

          {isAgency && <VersionHistory versions={item.versions ?? []} />}

          <div className="mt-7 pt-5 border-t border-[#ECECEE]">
            <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">Comments</div>
            {comments.length === 0 ? (
              <div className="text-sm text-[#9398A1]">No comments yet.</div>
            ) : (
              <ul className="flex flex-col gap-4">
                {comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{c.author}</span>
                      <span className="shrink-0 text-[11px] text-[#9398A1]">{formatShort(c.created_at)}</span>
                    </div>
                    <div className="text-[#15171C] whitespace-pre-wrap mt-0.5">{c.body}</div>
                    {(isAgency || c.author_id === currentUserId) && (
                      <CommentDeleteButton commentId={c.id} action={deleteCommentAction} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <AddCommentForm itemId={item.id} action={addCommentAction} />
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { setPostChannelsAction, splitPostChannelAction } from '@/app/(app)/postActions'
import { STATUS, type Item } from './Calendar'
import MentionInput, { type MentionCandidate } from './MentionInput'
import { STATUS_COLOUR as TASK_STATUS_COLOUR } from '@/lib/taskConstants'
import MediaSection from './MediaSection'
import AssetLinksSection from './AssetLinksSection'
import VersionHistory from './VersionHistory'
import ClientVersionHistory from './ClientVersionHistory'
import InternalNotes from './InternalNotes'
import ProductionDetails from './ProductionDetails'
import { labelCls, fieldCls, btnPrimary, btnGhost, btnDangerOutline } from '@/components/ui'

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

function AddCommentForm({ itemId, clientId, action }: { itemId: string; clientId: string; action: ActionFn }) {
  const [state, formAction, pending] = useActionState(action, initial)
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  useEffect(() => { if (state.ok) { setBody(''); setMentions([]) } }, [state.ok])

  // Mentionable people for THIS post: agency team members with a login + the post's client
  // contacts linked to a portal user. Fetched RLS-respectingly — a client-portal commenter can
  // read neither table, so their picker is simply empty (acceptable in v1). The RPC re-checks.
  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const [{ data: team }, { data: contacts }] = await Promise.all([
        supabase.from('team_member').select('user_id, full_name'),
        supabase.from('client_contact').select('user_id, first_name, surname').eq('client_id', clientId).not('user_id', 'is', null),
      ])
      if (!active) return
      const byId = new Map<string, MentionCandidate>()
      for (const t of team ?? []) if ((t as any).user_id) byId.set((t as any).user_id, { userId: (t as any).user_id, name: (t as any).full_name })
      for (const c of contacts ?? []) if ((c as any).user_id) {
        const name = [(c as any).first_name, (c as any).surname].filter(Boolean).join(' ') || 'Client contact'
        byId.set((c as any).user_id, { userId: (c as any).user_id, name })
      }
      setCandidates([...byId.values()])
    })()
    return () => { active = false }
  }, [clientId])

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="mentions" value={mentions.join(',')} />
      <MentionInput
        value={body}
        onChange={setBody}
        onMentionsChange={setMentions}
        candidates={candidates}
        rows={2}
        placeholder="Add a comment — @ to mention"
        className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white"
      />
      {state.error && <p className="text-sm text-red-600 mt-2">{state.error}</p>}
      <div className="mt-2">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className={btnPrimary}
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

// Agency-only channel-set editor (0054). Checkboxes pre-ticked to the post's current set; Save
// calls set_post_channels (no fork, no status change) then refreshes. set_post_channels requires
// at least one channel, so Save is disabled when nothing is ticked.
function ChannelsEditor({ item, channels }: { item: Item; channels: Channel[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const current = item.channels ?? []
  const [selected, setSelected] = useState<string[]>(current.map((c) => c.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync when a different post is opened.
  useEffect(() => { setSelected((item.channels ?? []).map((c) => c.id)) }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  const currentIds = current.map((c) => c.id)
  const dirty = selected.length !== currentIds.length || selected.some((id) => !currentIds.includes(id))

  async function save() {
    if (selected.length === 0 || busy) return
    setBusy(true); setError(null)
    const r = await setPostChannelsAction(item.id, selected)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  // Tailor: peel this channel into its own independent draft (split_post_channel). Operates on
  // the post's *saved* set (currentIds), not the unsaved checkbox state. On success, open the new
  // draft via ?post= (which also refreshes the server data so both posts appear).
  async function tailor(c: Channel) {
    if (busy) return
    const name = channelLabel(c)
    if (!window.confirm(`Tailor ${name}? This creates a separate draft post for ${name} that you can edit and approve independently, and removes it from this post.`)) return
    setBusy(true); setError(null)
    const r = await splitPostChannelAction(item.id, c.id)
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    const sp = new URLSearchParams(params.toString())
    sp.set('post', r.newItemId)
    router.push(`/?${sp.toString()}`)
  }

  return (
    <div className="mb-6">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Channels</div>
      {channels.length === 0 ? (
        <div className="text-sm text-[#9398A1]">No channels for this client.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="accent-[#15171C]" />
                {channelLabel(c)}
              </label>
              {/* Tailor only an attached channel, and only when there are 2+ to split from. */}
              {current.length >= 2 && currentIds.includes(c.id) && (
                <button type="button" onClick={() => tailor(c)} disabled={busy} className="text-[11px] text-[#5A5E66] hover:text-[#15171C] hover:underline disabled:opacity-50 cursor-pointer">Tailor</button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-1.5">{error}</p>}
      {channels.length > 0 && (
        <button
          onClick={save}
          disabled={busy || !dirty || selected.length === 0}
          className="mt-2 text-xs font-semibold bg-[#15171C] text-white rounded-md px-3 py-1.5 disabled:opacity-50 cursor-pointer"
        >
          {busy ? 'Saving…' : 'Save channels'}
        </button>
      )}
    </div>
  )
}

function EditPostForm({
  item,
  action,
  onCancel,
  isFork,
}: {
  item: Item
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
        <label className={labelCls}>Scheduled date &amp; time</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>Visual content</label>
        <textarea name="visual_content" rows={4} defaultValue={item.visual_content ?? ''} className={fieldCls} />
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
          className={btnPrimary}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
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
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={item.title ?? 'Post details'}>
      <div className="absolute inset-0 bg-black/20 animate-overlay-in" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col animate-panel-in">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[#ECECEE]">
          <div>
            {(item.channels?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap items-center gap-1 mb-1">
                {item.channels!.map((c) => (
                  <span key={c.id} className="text-[10px] uppercase tracking-wide text-[#5A5E66] bg-[#F4F4F6] rounded-full px-2 py-0.5">{c.label ?? cap(c.type)}</span>
                ))}
              </div>
            ) : (
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-1">No channel</div>
            )}
            <h2 className="text-lg font-bold leading-snug flex items-center gap-1.5">
              {item.title ?? 'Untitled'}
              {item.post_group_id && <span title="Part of a split channel set" className="text-[#9398A1]"><Link2 size={14} aria-label="Part of a split channel set" /></span>}
            </h2>
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
            <EditPostForm item={item} action={updatePostAction} onCancel={() => setEditing(false)} isFork={editableAsFork} />
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

          {isAgency && <ChannelsEditor item={item} channels={channels} />}

          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Visual content</div>
          {item.visual_content
            ? <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#15171C]">{item.visual_content}</div>
            : <div className="text-sm text-[#9398A1] italic">No visual brief yet.</div>}

          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">Caption</div>
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

          <AssetLinksSection
            links={item.asset_links ?? []}
            isAgency={isAgency}
            contentItemId={item.id}
          />

          {isAgency && (
            <div className="mt-7 pt-5 border-t border-[#ECECEE]">
              <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">Tasks</div>
              {(item.tasks?.length ?? 0) === 0 ? (
                <div className="text-sm text-[#9398A1]">No tasks for this post yet.</div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {item.tasks!.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{t.title}{t.ownerName && <span className="text-[#9398A1]"> · {t.ownerName}</span>}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs shrink-0 text-[#5A5E66]">
                        <span className="w-2 h-2 rounded-full" style={{ background: TASK_STATUS_COLOUR[t.status] ?? '#A6ABB3' }} />
                        {t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/tasks?forPost=${item.id}`} className="inline-block mt-3 text-sm text-[#15171C] font-medium hover:underline">+ Add task for this post</Link>
            </div>
          )}

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
                      className={danger ? btnDangerOutline : btnPrimary}
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

          {isAgency
            ? <VersionHistory versions={item.versions ?? []} />
            : <ClientVersionHistory itemId={item.id} />}

          {isAgency && <ProductionDetails item={item} clientId={item.client_id} />}

          {isAgency && (
            <div className="mt-7 pt-5 border-t border-[#ECECEE]">
              <InternalNotes parentType="post" parentId={item.id} currentUserId={currentUserId} />
            </div>
          )}

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
            <AddCommentForm itemId={item.id} clientId={item.client_id} action={addCommentAction} />
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addInternalNoteAction, updateInternalNoteAction, deleteInternalNoteAction } from '@/app/(app)/internalNoteActions'

type Note = {
  id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string | null
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Reusable agency-only internal notes, polymorphic over a parent (post/task). Reads
// directly (RLS-gated); writes via the SECURITY DEFINER RPCs. Resolves author names from
// team_member (agency-readable). Self-contained — fetches + refetches its own data.
export default function InternalNotes({
  parentType,
  parentId,
  currentUserId,
}: {
  parentType: 'post' | 'task'
  parentId: string
  currentUserId: string
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: rows, error: nErr }, { data: team }] = await Promise.all([
      supabase
        .from('internal_note')
        .select('id, author_id, body, created_at, updated_at')
        .eq('parent_type', parentType)
        .eq('parent_id', parentId)
        .order('created_at'),
      supabase.from('team_member').select('user_id, full_name'),
    ])
    if (nErr) { setError(nErr.message); return }
    setNotes((rows as Note[]) ?? [])
    const map: Record<string, string> = {}
    for (const t of team ?? []) if ((t as any).user_id) map[(t as any).user_id] = (t as any).full_name
    setNames(map)
  }, [parentType, parentId])

  useEffect(() => { load() }, [load])

  const authorName = (id: string | null) =>
    (id && names[id]) || (id === currentUserId ? 'You' : 'Unknown')

  async function add() {
    if (!draft.trim() || busy) return
    setBusy(true); setError(null)
    const r = await addInternalNoteAction(parentType, parentId, draft)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setDraft('')
    load()
  }

  async function saveEdit(id: string) {
    if (!editBody.trim() || busy) return
    setBusy(true); setError(null)
    const r = await updateInternalNoteAction(id, editBody)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setEditingId(null)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this note?')) return
    setBusy(true); setError(null)
    const r = await deleteInternalNoteAction(id)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    load()
  }

  return (
    <div className="rounded-xl border border-[#E8B43A]/40 bg-[#FBF7EC] p-4">
      <div className="text-[11px] uppercase tracking-wide text-[#8A6D1F] font-semibold mb-0.5">Internal notes</div>
      <div className="text-[11px] text-[#9A7B27] mb-3">Not visible to the client.</div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-3 mb-3">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{authorName(n.author_id)}</span>
                <span className="shrink-0 text-[11px] text-[#9398A1]">
                  {fmt(n.created_at)}{n.updated_at ? ' · edited' : ''}
                </span>
              </div>
              {editingId === n.id ? (
                <div className="mt-1">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => saveEdit(n.id)} disabled={busy} className="text-xs font-semibold bg-[#15171C] text-white rounded-md px-2.5 py-1 disabled:opacity-50 cursor-pointer">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-[#5A5E66] hover:underline cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-[#15171C] whitespace-pre-wrap mt-0.5">{n.body}</div>
                  {n.author_id === currentUserId && (
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => { setEditingId(n.id); setEditBody(n.body) }} className="text-[11px] text-[#5A5E66] hover:underline cursor-pointer">Edit</button>
                      <button onClick={() => remove(n.id)} className="text-[11px] text-[#5A5E66] hover:text-[#E0572E] hover:underline cursor-pointer">Delete</button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="Add an internal note"
        className="w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white"
      />
      <div className="flex items-center justify-between mt-1.5">
        {error ? <span className="text-xs text-red-600">{error}</span> : <span />}
        <button onClick={add} disabled={busy || !draft.trim()} className="text-xs font-semibold bg-[#15171C] text-white rounded-md px-3 py-1.5 disabled:opacity-50 cursor-pointer">
          {busy ? 'Saving…' : 'Add note'}
        </button>
      </div>
    </div>
  )
}

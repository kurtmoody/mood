'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical, Pencil, Trash2, ExternalLink } from 'lucide-react'
import {
  addAssetLinkAction,
  updateAssetLinkAction,
  deleteAssetLinkAction,
  reorderAssetLinkAction,
  type LinkResult,
} from '@/app/(app)/assetLinkActions'
import type { AssetLink } from './Calendar'

const PRESETS = ['Drive folder', 'Raw footage', 'Final exports', 'Other']
const fieldCls = 'w-full border border-[#E2E2E5] rounded-lg px-2.5 py-1.5 text-sm bg-white'

function isUrl(s: string) {
  return /^https?:\/\//i.test(s.trim())
}

// Shared add/edit form: preset select with a free-text box when "Other" is chosen.
function LinkForm({ initialLabel = '', initialUrl = '', submitLabel, onSubmit, onCancel }: {
  initialLabel?: string
  initialUrl?: string
  submitLabel: string
  onSubmit: (label: string, url: string) => Promise<void>
  onCancel?: () => void
}) {
  const presetMatch = PRESETS.includes(initialLabel) && initialLabel !== 'Other' ? initialLabel : initialLabel ? 'Other' : 'Drive folder'
  const [preset, setPreset] = useState(presetMatch)
  const [custom, setCustom] = useState(presetMatch === 'Other' ? initialLabel : '')
  const [url, setUrl] = useState(initialUrl)
  const [pending, setPending] = useState(false)
  const label = (preset === 'Other' ? custom : preset).trim()

  async function submit() {
    if (!label || !url.trim()) return
    setPending(true)
    await onSubmit(label, url.trim())
    setPending(false)
  }

  return (
    <div className="flex flex-col gap-2 border border-[#ECECEE] rounded-lg p-2.5 bg-[#FBFBFC]">
      <div className="flex gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={fieldCls}>
          {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {preset === 'Other' && (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Label" className={fieldCls} />
        )}
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={fieldCls} />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !label || !url.trim()}
          className="bg-[#15171C] text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 cursor-pointer"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm text-[#5A5E66] rounded-lg px-2.5 py-1.5 hover:bg-[#F4F4F6] cursor-pointer">Cancel</button>
        )}
      </div>
    </div>
  )
}

export default function AssetLinksSection({ links, isAgency, contentItemId }: { links: AssetLink[]; isAgency: boolean; contentItemId: string }) {
  const router = useRouter()
  const [items, setItems] = useState(links)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragIndex = useRef<number | null>(null)

  // Re-sync local order when the server set changes (after revalidate).
  const key = links.map((l) => l.id).join(',')
  useEffect(() => { setItems(links) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clients with no links see nothing.
  if (!isAgency && items.length === 0) return null

  async function run(p: Promise<LinkResult>) {
    setError(null)
    const r = await p
    if (r?.error) { setError(r.error); return false }
    router.refresh()
    return true
  }

  async function onDrop(to: number) {
    const from = dragIndex.current
    dragIndex.current = null
    setOverIndex(null)
    if (from === null || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next) // optimistic
    await run(reorderAssetLinkAction(contentItemId, next.map((l) => l.id)))
  }

  return (
    <div className="mt-7 pt-5 border-t border-[#ECECEE]">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">Asset links</div>

      {items.length === 0 ? (
        <div className="text-sm text-[#9398A1]">No asset links yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((l, i) => (
            <li
              key={l.id}
              draggable={isAgency && editingId === null}
              onDragStart={isAgency ? () => { dragIndex.current = i } : undefined}
              onDragOver={isAgency ? (e) => { e.preventDefault(); setOverIndex(i) } : undefined}
              onDragLeave={isAgency ? () => setOverIndex((c) => (c === i ? null : c)) : undefined}
              onDrop={isAgency ? () => onDrop(i) : undefined}
              onDragEnd={isAgency ? () => { dragIndex.current = null; setOverIndex(null) } : undefined}
              className={`rounded-lg ${overIndex === i ? 'ring-2 ring-[#15171C]/30' : ''}`}
            >
              {editingId === l.id ? (
                <LinkForm
                  initialLabel={l.label}
                  initialUrl={l.url}
                  submitLabel="Save"
                  onSubmit={async (label, url) => { if (await run(updateAssetLinkAction(l.id, label, url))) setEditingId(null) }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className={`flex items-center gap-2 text-sm ${isAgency ? 'cursor-move' : ''}`}>
                  {isAgency && <GripVertical size={14} className="shrink-0 text-[#C0C4CC]" />}
                  <span className="text-[#5A5E66] shrink-0">{l.label}:</span>
                  {isUrl(l.url) ? (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      draggable={false}
                      className="text-[#15171C] underline truncate inline-flex items-center gap-1 min-w-0"
                    >
                      <span className="truncate">{l.url}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate min-w-0">{l.url}</span>
                  )}
                  {isAgency && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditingId(l.id)} aria-label="Edit" className="p-1 text-[#9398A1] hover:text-[#15171C] cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => { if (confirm('Remove this link?')) run(deleteAssetLinkAction(l.id)) }} aria-label="Remove" className="p-1 text-[#9398A1] hover:text-[#E0572E] cursor-pointer"><Trash2 size={13} /></button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAgency && (
        <div className="mt-3">
          {adding ? (
            <LinkForm
              submitLabel="Add link"
              onSubmit={async (label, url) => { if (await run(addAssetLinkAction(contentItemId, label, url))) setAdding(false) }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button onClick={() => setAdding(true)} className="text-sm text-[#15171C] font-medium hover:underline cursor-pointer">+ Add link</button>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}
    </div>
  )
}

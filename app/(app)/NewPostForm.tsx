'use client'

import { useActionState, useEffect, useState } from 'react'
import { createPostAction, type PostState } from './postActions'
import { labelCls, fieldCls, btnPrimary, btnGhost } from '@/components/ui'

type ClientOption = { id: string; name: string }
type Channel = { id: string; type: string; label: string | null }

const initial: PostState = { error: null, ok: false }

const CONTENT_TYPES = ['post', 'story', 'reel', 'carousel', 'blog', 'newsletter', 'other']

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function NewPostForm({
  clients,
  channelsByClient,
  defaultClientId,
  defaultDate,
  onClose,
}: {
  clients: ClientOption[]
  channelsByClient: Record<string, Channel[]>
  defaultClientId: string
  defaultDate: string
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(createPostAction, initial)
  const [clientId, setClientId] = useState(defaultClientId)
  const [when, setWhen] = useState(defaultDate)

  useEffect(() => { if (state.ok) onClose() }, [state.ok]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const channels = channelsByClient[clientId] ?? []
  const iso = when ? new Date(when).toISOString() : ''

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New post">
      <div className="absolute inset-0 bg-black/20 animate-overlay-in" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-white border-l border-[#ECECEE] shadow-xl flex flex-col animate-panel-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#ECECEE]">
          <h2 className="text-lg font-bold">New post</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form action={action} className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-4">
          <input type="hidden" name="scheduled_at" value={iso} />

          <div>
            <label className={labelCls}>Client *</label>
            <select name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} className={fieldCls}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Channel</label>
            <select name="channel_id" defaultValue="" className={fieldCls}>
              <option value="">No channel</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.label ? `${ch.label} (${cap(ch.type)})` : cap(ch.type)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Content type</label>
            <select name="content_type" defaultValue="post" className={fieldCls}>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Title</label>
            <input name="title" className={fieldCls} placeholder="Summer launch teaser" />
          </div>

          <div>
            <label className={labelCls}>Scheduled date &amp; time *</label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Body</label>
            <textarea name="body" rows={6} className={fieldCls} />
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !clientId || !when}
              className={btnPrimary}
            >
              {pending ? 'Creating…' : 'Create post'}
            </button>
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

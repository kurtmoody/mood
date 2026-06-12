'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addChannelAction, deleteChannelAction, type ChannelState } from './channelActions'
import { labelCls, fieldCls, btnPrimary } from '@/components/ui'

export type Channel = {
  id: string
  type: string
  label: string | null
}

const initial: ChannelState = { error: null, ok: false }

const TYPES = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'blog', 'newsletter', 'other']

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function AddChannelForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addChannelAction, initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) ref.current?.reset() }, [state.ok])

  return (
    <form ref={ref} action={action} className="border border-[#ECECEE] rounded-2xl bg-white p-5">
      <div className="text-sm font-semibold mb-4">Add channel</div>
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <select name="type" defaultValue="instagram" className={fieldCls}>
            {TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Label</label>
          <input name="label" className={fieldCls} placeholder="@hotelvalentina" />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className={btnPrimary}
        >
          {pending ? 'Adding…' : 'Add channel'}
        </button>
      </div>
    </form>
  )
}

function DeleteChannelButton({ channelId, clientId }: { channelId: string; clientId: string }) {
  const [state, action, pending] = useActionState(deleteChannelAction, initial)
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm('Delete this channel? It will be un-assigned from any posts (the posts are kept).')) e.preventDefault() }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="channel_id" value={channelId} />
      <button type="submit" disabled={pending} className="text-sm text-[#E0572E] hover:underline disabled:opacity-50">
        Delete
      </button>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}

function ChannelRow({ channel, clientId }: { channel: Channel; clientId: string }) {
  return (
    <div className="px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 flex items-center justify-between gap-4">
      <div className="text-sm">
        <span className="font-semibold">{cap(channel.type)}</span>
        {channel.label && <span className="text-[#5A5E66]"> · {channel.label}</span>}
      </div>
      <div className="shrink-0">
        <DeleteChannelButton channelId={channel.id} clientId={clientId} />
      </div>
    </div>
  )
}

export default function ChannelsSection({ clientId, channels }: { clientId: string; channels: Channel[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-bold">Channels</div>
        <div className="text-sm text-[#5A5E66]">{channels.length} {channels.length === 1 ? 'channel' : 'channels'}</div>
      </div>

      {channels.length === 0 ? (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-10 text-center text-sm text-[#5A5E66]">
          No channels yet.
        </div>
      ) : (
        <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-hidden">
          {channels.map((c) => <ChannelRow key={c.id} channel={c} clientId={clientId} />)}
        </div>
      )}

      <AddChannelForm clientId={clientId} />
    </div>
  )
}

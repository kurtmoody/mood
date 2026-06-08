'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Eye, Check, PencilLine, MessageSquare, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { maltaDate, mondayOf } from '@/lib/week'

type Notif = {
  id: string
  type: string
  content_item_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
}

const TYPE_ICON: Record<string, LucideIcon> = {
  ready_for_review: Eye,
  approved: Check,
  changes_requested: PencilLine,
  comment: MessageSquare,
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const router = useRouter()
  const supabase = createClient()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)

  // RLS scopes all of these to the current user's own rows — no user_id filter needed.
  async function loadCount() {
    const { count } = await supabase
      .from('notification')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    setUnread(count ?? 0)
  }

  async function loadList() {
    setLoading(true)
    const { data } = await supabase
      .from('notification')
      .select('id, type, content_item_id, body, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(15)
    setItems((data as Notif[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadCount() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) { loadList(); loadCount() } // re-fetch on open (no realtime in V1)
  }

  async function markRead(n: Notif) {
    if (n.read_at) return
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
    setUnread((u) => Math.max(0, u - 1))
    // Only flips read_at; UPDATE RLS scopes it to the user's own rows.
    await supabase.from('notification').update({ read_at: new Date().toISOString() }).eq('id', n.id).is('read_at', null)
  }

  async function markAll() {
    setItems((cur) => cur.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })))
    setUnread(0)
    await supabase.from('notification').update({ read_at: new Date().toISOString() }).is('read_at', null)
  }

  async function openNotification(n: Notif) {
    await markRead(n)
    setOpen(false)
    if (!n.content_item_id) return
    // RLS-scoped resolve: a post the user can't see (or that's gone) returns null →
    // we simply don't navigate. No privileged fetch; visibility is enforced by RLS.
    const { data: post } = await supabase
      .from('content_item')
      .select('client_id, scheduled_at')
      .eq('id', n.content_item_id)
      .maybeSingle()
    if (!post || !post.scheduled_at) return
    const monday = mondayOf(maltaDate(post.scheduled_at))
    router.push(`/?client=${post.client_id}&week=${monday}&view=week&post=${n.content_item_id}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative w-9 h-9 grid place-items-center rounded-lg text-[#5A5E66] hover:bg-[#F4F4F6] cursor-pointer"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E0572E] text-white text-[10px] font-semibold grid place-items-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-[#ECECEE] rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#ECECEE]">
            <span className="text-sm font-semibold">Notifications</span>
            {items.some((x) => !x.read_at) && (
              <button onClick={markAll} className="text-xs text-[#5A5E66] hover:underline cursor-pointer">Mark all as read</button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-sm text-[#9398A1] text-center">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#9398A1] text-center">No notifications yet.</div>
            ) : (
              items.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC] cursor-pointer ${n.read_at ? '' : 'bg-[#F2F6FF]'}`}
                  >
                    <span className="mt-0.5 text-[#9398A1] shrink-0"><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read_at ? 'text-[#5A5E66]' : 'text-[#15171C] font-medium'}`}>{n.body ?? n.type}</span>
                      <span className="block text-[11px] text-[#9398A1] mt-0.5">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

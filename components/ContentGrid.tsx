'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { setPostMetaAction } from '@/app/(app)/postActions'
import { STATUS, type Item } from './Calendar'

type ClientOpt = { id: string; name: string; colour: string; archived?: boolean }
type TeamOpt = { id: string; full_name: string }

const cellInput = 'w-full bg-transparent border border-transparent hover:border-[#E2E2E5] focus:border-[#15171C] focus:bg-white rounded px-1.5 py-1 text-[12px] outline-none'

// Agency-only dense production tracker over the SAME posts as the calendar (passed in,
// already filtered). Metadata cells are inline-editable via set_post_meta (no version
// fork); status/title/date are read-only here (the row title opens the full drawer).
export default function ContentGrid({
  posts,
  clients,
  onSelect,
}: {
  posts: Item[]
  clients: ClientOpt[]
  onSelect: (item: Item) => void
}) {
  const [team, setTeam] = useState<TeamOpt[]>([])
  const [pmByClient, setPmByClient] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const [{ data: members }, { data: own }] = await Promise.all([
        supabase.from('team_member').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('client_ownership').select('client_id, lead_pm:lead_pm_id ( full_name )'),
      ])
      setTeam((members as TeamOpt[]) ?? [])
      const map: Record<string, string> = {}
      for (const o of own ?? []) {
        const pm = (o as any).lead_pm
        const name = Array.isArray(pm) ? pm[0]?.full_name : pm?.full_name
        if (name) map[(o as any).client_id] = name
      }
      setPmByClient(map)
    })()
  }, [])

  // Group posts by client (clients ordered by name; rows by scheduled date).
  const groups = useMemo(() => {
    const byClient = new Map<string, Item[]>()
    for (const p of posts) {
      const arr = byClient.get(p.client_id)
      if (arr) arr.push(p); else byClient.set(p.client_id, [p])
    }
    return clients
      .filter((c) => byClient.has(c.id))
      .map((c) => ({
        client: c,
        rows: (byClient.get(c.id) ?? []).slice().sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
      }))
  }, [posts, clients])

  const cols = 14

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
      {error && <div className="px-4 py-2 text-sm text-red-600 border-b border-[#ECECEE]">{error}</div>}
      <table className="w-full min-w-[1500px] text-[12px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
            <th className="font-semibold px-3 py-2.5 min-w-[220px]">Post</th>
            <th className="font-semibold px-2 py-2.5 whitespace-nowrap">Scheduled</th>
            <th className="font-semibold px-2 py-2.5">Platform</th>
            <th className="font-semibold px-2 py-2.5 min-w-[130px]">Designer</th>
            <th className="font-semibold px-2 py-2.5 min-w-[120px]">Design status</th>
            <th className="font-semibold px-2 py-2.5">Status</th>
            <th className="font-semibold px-2 py-2.5">Boost</th>
            <th className="font-semibold px-2 py-2.5 min-w-[90px]">Ad budget</th>
            <th className="font-semibold px-2 py-2.5 min-w-[120px]">Drive</th>
            <th className="font-semibold px-2 py-2.5 min-w-[120px]">High-res</th>
            <th className="font-semibold px-2 py-2.5">Posted</th>
            <th className="font-semibold px-2 py-2.5 min-w-[120px]">Posted link</th>
            <th className="font-semibold px-2 py-2.5 whitespace-nowrap">Date posted</th>
            <th className="font-semibold px-2 py-2.5 min-w-[110px]">PM</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr><td colSpan={cols} className="px-4 py-8 text-center text-[#9398A1]">No posts in this period.</td></tr>
          ) : groups.map(({ client, rows }) => (
            <ClientGroup
              key={client.id}
              client={client}
              rows={rows}
              cols={cols}
              team={team}
              pmName={pmByClient[client.id] ?? null}
              onSelect={onSelect}
              onError={setError}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClientGroup({ client, rows, cols, team, pmName, onSelect, onError }: {
  client: ClientOpt
  rows: Item[]
  cols: number
  team: TeamOpt[]
  pmName: string | null
  onSelect: (item: Item) => void
  onError: (msg: string | null) => void
}) {
  return (
    <>
      <tr className="bg-[#FBFBFC] border-b border-[#ECECEE]">
        <td colSpan={cols} className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: client.colour }} />
            {client.name}
            {client.archived && <span className="text-[10px] uppercase tracking-wide text-[#9398A1] border border-[#E2E2E5] rounded px-1.5 py-0.5">Archived</span>}
            <span className="text-[11px] text-[#9398A1] font-normal">{rows.length}</span>
          </span>
        </td>
      </tr>
      {rows.map((p) => (
        <GridRow key={p.id} post={p} team={team} pmName={pmName} onSelect={onSelect} onError={onError} />
      ))}
    </>
  )
}

type Meta = {
  designer_id: string | null
  design_status: string | null
  drive_url: string | null
  high_res_url: string | null
  boost: boolean
  ad_budget: number | null
  date_posted: string | null
  posted_url: string | null
}

function metaOf(p: Item): Meta {
  return {
    designer_id: p.designer_id ?? null,
    design_status: p.design_status ?? null,
    drive_url: p.drive_url ?? null,
    high_res_url: p.high_res_url ?? null,
    boost: !!p.boost,
    ad_budget: p.ad_budget ?? null,
    date_posted: p.date_posted ?? null,
    posted_url: p.posted_url ?? null,
  }
}

function GridRow({ post, team, pmName, onSelect, onError }: {
  post: Item
  team: TeamOpt[]
  pmName: string | null
  onSelect: (item: Item) => void
  onError: (msg: string | null) => void
}) {
  const [meta, setMeta] = useState<Meta>(() => metaOf(post))
  const [budgetStr, setBudgetStr] = useState<string>(post.ad_budget != null ? String(post.ad_budget) : '')
  const [saving, setSaving] = useState(false)

  // Re-sync if the post changes upstream (e.g. drawer edit + refresh).
  useEffect(() => {
    setMeta(metaOf(post))
    setBudgetStr(post.ad_budget != null ? String(post.ad_budget) : '')
  }, [post.designer_id, post.design_status, post.drive_url, post.high_res_url, post.boost, post.ad_budget, post.date_posted, post.posted_url]) // eslint-disable-line react-hooks/exhaustive-deps

  // set_post_meta overwrites ALL metadata columns, so always send the full row meta.
  // Optimistic: local `next` is already applied; revert to the post's values on error.
  async function save(next: Meta) {
    setSaving(true); onError(null)
    const r = await setPostMetaAction(post.id, next)
    setSaving(false)
    if (r.error) {
      setMeta(metaOf(post))
      setBudgetStr(post.ad_budget != null ? String(post.ad_budget) : '')
      onError(`Couldn't save "${post.title ?? 'post'}": ${r.error}`)
    }
  }

  // commit a patch: update local state, then persist the whole row.
  function commit(patch: Partial<Meta>) {
    const next = { ...meta, ...patch }
    setMeta(next)
    save(next)
  }

  const s = STATUS[post.status] ?? STATUS.draft
  const platform = post.channel?.type ?? post.content_type
  const scheduled = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <tr className={`border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC] ${saving ? 'opacity-70' : ''}`}>
      <td className="px-3 py-1.5">
        <button onClick={() => onSelect(post)} className="text-left font-medium hover:underline cursor-pointer">
          {post.title || <span className="text-[#9398A1]">Untitled</span>}
        </button>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap text-[#5A5E66]">{scheduled}</td>
      <td className="px-2 py-1.5 capitalize text-[#5A5E66]">{platform}</td>

      {/* Designer */}
      <td className="px-2 py-1.5">
        <select value={meta.designer_id ?? ''} onChange={(e) => commit({ designer_id: e.target.value || null })} className={cellInput}>
          <option value="">—</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </td>

      {/* Design status */}
      <td className="px-2 py-1.5">
        <input
          value={meta.design_status ?? ''}
          onChange={(e) => setMeta((m) => ({ ...m, design_status: e.target.value || null }))}
          onBlur={() => commit({ design_status: meta.design_status })}
          className={cellInput}
          placeholder="—"
        />
      </td>

      {/* Overall status — read-only */}
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[#5A5E66]">
          <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />{s.label}
        </span>
      </td>

      {/* Boost */}
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={meta.boost} onChange={(e) => commit({ boost: e.target.checked })} className="cursor-pointer" />
      </td>

      {/* Ad budget */}
      <td className="px-2 py-1.5">
        <input
          value={budgetStr}
          onChange={(e) => setBudgetStr(e.target.value)}
          onBlur={() => {
            const v = budgetStr.trim() === '' ? null : Number(budgetStr)
            if (v !== null && Number.isNaN(v)) { onError('Ad budget must be a number.'); setBudgetStr(post.ad_budget != null ? String(post.ad_budget) : ''); return }
            commit({ ad_budget: v })
          }}
          type="number" step="0.01" min="0" className={cellInput} placeholder="—"
        />
      </td>

      {/* Drive / High-res / Posted link */}
      <td className="px-2 py-1.5"><UrlCell value={meta.drive_url} onSet={(v) => setMeta((m) => ({ ...m, drive_url: v }))} onCommit={() => commit({ drive_url: meta.drive_url })} /></td>
      <td className="px-2 py-1.5"><UrlCell value={meta.high_res_url} onSet={(v) => setMeta((m) => ({ ...m, high_res_url: v }))} onCommit={() => commit({ high_res_url: meta.high_res_url })} /></td>

      {/* Posted — read-only (from status) */}
      <td className="px-2 py-1.5 text-[#5A5E66]">{post.status === 'posted' ? 'Yes' : 'No'}</td>

      <td className="px-2 py-1.5"><UrlCell value={meta.posted_url} onSet={(v) => setMeta((m) => ({ ...m, posted_url: v }))} onCommit={() => commit({ posted_url: meta.posted_url })} /></td>

      {/* Date posted */}
      <td className="px-2 py-1.5">
        <input type="date" value={meta.date_posted ?? ''} onChange={(e) => commit({ date_posted: e.target.value || null })} className={cellInput} />
      </td>

      {/* PM — read-only derived */}
      <td className="px-2 py-1.5 text-[#5A5E66] whitespace-nowrap">{pmName ?? '—'}</td>
    </tr>
  )
}

// A URL cell: editable text that commits on blur; shows a small link glyph when set.
function UrlCell({ value, onSet, onCommit }: { value: string | null; onSet: (v: string | null) => void; onCommit: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        value={value ?? ''}
        onChange={(e) => onSet(e.target.value || null)}
        onBlur={onCommit}
        type="url"
        className={cellInput}
        placeholder="—"
      />
      {value && <a href={value} target="_blank" rel="noreferrer" className="shrink-0 text-[#9398A1] hover:text-[#15171C]" onClick={(e) => e.stopPropagation()}><Link2 size={12} /></a>}
    </div>
  )
}

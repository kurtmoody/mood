'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2, Download, Image as ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { setPostMetaAction } from '@/app/(app)/postActions'
import { setViewPreferenceAction } from '@/app/(app)/viewPrefActions'
import ColumnPicker from './ColumnPicker'
import { mergeColumns, toConfig, type ColumnConfig, type ColumnDef, type ResolvedColumn } from '@/lib/viewColumns'
import { STATUS, type Item } from './Calendar'
import { btnSecondary, fieldClsSm } from '@/components/ui'

type ClientOpt = { id: string; name: string; colour: string; archived?: boolean }
type TeamOpt = { id: string; full_name: string }

export type GroupBy = 'client' | 'pm' | 'designer' | 'status' | 'platform' | 'none'

export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'pm', label: 'Project manager' },
  { value: 'designer', label: 'Designer' },
  { value: 'status', label: 'Status' },
  { value: 'platform', label: 'Platform' },
  { value: 'none', label: 'None' },
]

const STATUS_ORDER = ['draft', 'internal_review', 'client_review', 'changes_requested', 'approved', 'scheduled', 'posted']

// The full column set; order/visibility is per-user (view_key 'content_table').
// 'post' is the identifier and can't be hidden. 'client' is auto-suppressed while
// grouping by client (the group header already carries it).
const COLUMNS: ColumnDef[] = [
  { key: 'post', label: 'Post', lockable: false },
  { key: 'thumb', label: 'Thumbnail', lockable: true },
  { key: 'client', label: 'Client', lockable: true },
  { key: 'scheduled', label: 'Scheduled', lockable: true },
  { key: 'platform', label: 'Platform', lockable: true },
  { key: 'caption', label: 'Caption', lockable: true },
  { key: 'designer', label: 'Designer', lockable: true },
  { key: 'design_status', label: 'Design status', lockable: true },
  { key: 'status', label: 'Status', lockable: true },
  { key: 'boost', label: 'Boost', lockable: true },
  { key: 'ad_budget', label: 'Ad budget', lockable: true },
  { key: 'drive', label: 'Drive', lockable: true },
  { key: 'high_res', label: 'High-res', lockable: true },
  { key: 'posted', label: 'Posted', lockable: true },
  { key: 'posted_url', label: 'Posted link', lockable: true },
  { key: 'date_posted', label: 'Date posted', lockable: true },
  { key: 'pm', label: 'PM', lockable: true },
]

const cellInput = 'w-full bg-transparent border border-transparent hover:border-[#E2E2E5] focus:border-[#15171C] focus:bg-white rounded px-1.5 py-1 text-[12px] outline-none'

// Posted is true once the status machine says so OR a posted date has been filled in —
// the two can lag each other and either one means the post is live.
const isPosted = (p: Item) => p.status === 'posted' || !!p.date_posted

// Agency-only table over the SAME posts as the calendar (passed in, already filtered).
// Metadata cells are inline-editable via set_post_meta (no version fork); title/status/
// caption are read-only here (the row title opens the full drawer).
export default function ContentGrid({
  posts,
  clients,
  onSelect,
  groupBy,
  onGroupByChange,
  savedColumns,
  month,
}: {
  posts: Item[]
  clients: ClientOpt[]
  onSelect: (item: Item) => void
  groupBy: GroupBy
  onGroupByChange: (g: GroupBy) => void
  savedColumns: ColumnConfig[] | null
  month: string
}) {
  const [team, setTeam] = useState<TeamOpt[]>([])
  const [pmByClient, setPmByClient] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const [cols, setCols] = useState<ResolvedColumn[]>(() => mergeColumns(COLUMNS, savedColumns))
  function changeColumns(next: ResolvedColumn[]) {
    setCols(next)
    setViewPreferenceAction('content_table', toConfig(next)) // fire and forget — local state is truth
  }

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

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const designerName = (id: string | null | undefined) => team.find((t) => t.id === id)?.full_name ?? null

  // While grouping by client the Client column is redundant — suppress it.
  const visibleCols = cols.filter((c) => !c.hidden && !(c.key === 'client' && groupBy === 'client'))

  // Bucket the posts by the active group key; rows within a group sort by schedule.
  const groups = useMemo(() => {
    type Group = { key: string; label: string; colour?: string; rows: Item[] }
    const byKey = new Map<string, Group>()
    const add = (key: string, label: string, colour: string | undefined, p: Item) => {
      const g = byKey.get(key)
      if (g) g.rows.push(p)
      else byKey.set(key, { key, label, colour, rows: [p] })
    }
    for (const p of posts) {
      if (groupBy === 'client') {
        const c = clientById.get(p.client_id)
        add(p.client_id, c?.name ?? 'Unknown client', c?.colour, p)
      } else if (groupBy === 'pm') {
        const name = pmByClient[p.client_id]
        add(name ?? '__none__', name ?? 'No project manager', undefined, p)
      } else if (groupBy === 'designer') {
        const name = designerName(p.designer_id)
        add(name ?? '__none__', name ?? 'No designer', undefined, p)
      } else if (groupBy === 'status') {
        add(p.status, STATUS[p.status]?.label ?? p.status, undefined, p)
      } else if (groupBy === 'platform') {
        const t = p.channel?.type ?? p.content_type
        add(t, t.charAt(0).toUpperCase() + t.slice(1), undefined, p)
      } else {
        add('__all__', '', undefined, p)
      }
    }
    const list = [...byKey.values()]
    for (const g of list) g.rows.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
    if (groupBy === 'client') {
      const order = new Map(clients.map((c, i) => [c.id, i]))
      list.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
    } else if (groupBy === 'status') {
      list.sort((a, b) => STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key))
    } else {
      // Alphabetical, with the "No …" bucket last.
      list.sort((a, b) => (a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : a.label.localeCompare(b.label)))
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, groupBy, clientById, pmByClient, team, clients])

  // CSV of the visible rows: all data columns except the thumbnail, client always
  // included (grouping hides the column but reports need it), captions in full.
  function exportCsv() {
    const csvCols = cols.filter((c) => c.key !== 'thumb' && (!c.hidden || c.key === 'client'))
    const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
    const lines = [csvCols.map((c) => esc(c.label)).join(',')]
    for (const g of groups) for (const p of g.rows) {
      lines.push(csvCols.map((c) => {
        switch (c.key) {
          case 'post': return esc(p.title)
          case 'client': return esc(clientById.get(p.client_id)?.name)
          case 'scheduled': return esc(p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('en-GB', { timeZone: 'Europe/Malta' }) : '')
          case 'platform': return esc(p.channel?.type ?? p.content_type)
          case 'caption': return esc(p.body)
          case 'designer': return esc(designerName(p.designer_id))
          case 'design_status': return esc(p.design_status)
          case 'status': return esc(STATUS[p.status]?.label ?? p.status)
          case 'boost': return esc(p.boost ? 'Yes' : 'No')
          case 'ad_budget': return esc(p.ad_budget != null ? String(p.ad_budget) : '')
          case 'drive': return esc(p.drive_url)
          case 'high_res': return esc(p.high_res_url)
          case 'posted': return esc(isPosted(p) ? 'Yes' : 'No')
          case 'posted_url': return esc(p.posted_url)
          case 'date_posted': return esc(p.date_posted)
          case 'pm': return esc(pmByClient[p.client_id])
          default: return esc('')
        }
      }).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `content-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Group by
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
            className={`${fieldClsSm} w-auto`}
          >
            {GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <ColumnPicker columns={cols} onChange={changeColumns} />
          <button onClick={exportCsv} className={btnSecondary}>
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
        {error && <div className="px-4 py-2 text-sm text-red-600 border-b border-[#ECECEE]">{error}</div>}
        <table className="w-full min-w-[1500px] text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#9398A1] border-b border-[#ECECEE]">
              {visibleCols.map((c) => (
                <th key={c.key} className={`font-semibold py-2.5 whitespace-nowrap ${headerCls(c.key)}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={visibleCols.length} className="px-4 py-8 text-center text-[#9398A1]">No posts in this period.</td></tr>
            ) : groups.map((g) => (
              <GroupSection
                key={g.key}
                label={g.label}
                colour={g.colour}
                archived={groupBy === 'client' && clientById.get(g.key)?.archived}
                rows={g.rows}
                colSpan={visibleCols.length}
                visibleCols={visibleCols}
                team={team}
                pmByClient={pmByClient}
                clientById={clientById}
                onSelect={onSelect}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function headerCls(key: string) {
  if (key === 'post') return 'px-3 min-w-[200px]'
  if (key === 'caption') return 'px-2 min-w-[220px]'
  if (key === 'designer' || key === 'pm') return 'px-2 min-w-[120px]'
  if (key === 'design_status' || key === 'drive' || key === 'high_res' || key === 'posted_url') return 'px-2 min-w-[110px]'
  if (key === 'ad_budget') return 'px-2 min-w-[90px]'
  return 'px-2'
}

function GroupSection({ label, colour, archived, rows, colSpan, visibleCols, team, pmByClient, clientById, onSelect, onError }: {
  label: string
  colour?: string
  archived?: boolean
  rows: Item[]
  colSpan: number
  visibleCols: ResolvedColumn[]
  team: TeamOpt[]
  pmByClient: Record<string, string>
  clientById: Map<string, ClientOpt>
  onSelect: (item: Item) => void
  onError: (msg: string | null) => void
}) {
  return (
    <>
      {label && (
        <tr className="bg-[#FBFBFC] border-b border-[#ECECEE]">
          <td colSpan={colSpan} className="px-3 py-1.5">
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
              {colour && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colour }} />}
              {label}
              {archived && <span className="text-[10px] uppercase tracking-wide text-[#9398A1] border border-[#E2E2E5] rounded px-1.5 py-0.5">Archived</span>}
              <span className="text-[11px] text-[#9398A1] font-normal">{rows.length}</span>
            </span>
          </td>
        </tr>
      )}
      {rows.map((p) => (
        <GridRow
          key={p.id}
          post={p}
          visibleCols={visibleCols}
          team={team}
          pmName={pmByClient[p.client_id] ?? null}
          client={clientById.get(p.client_id) ?? null}
          onSelect={onSelect}
          onError={onError}
        />
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

function GridRow({ post, visibleCols, team, pmName, client, onSelect, onError }: {
  post: Item
  visibleCols: ResolvedColumn[]
  team: TeamOpt[]
  pmName: string | null
  client: ClientOpt | null
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
  const thumb = (post.media ?? []).find((m) => m.url && m.mime_type?.startsWith('image/'))

  function cell(key: string) {
    switch (key) {
      case 'post': return (
        <td key={key} className="px-3 py-1.5">
          <button onClick={() => onSelect(post)} className="text-left font-medium hover:underline cursor-pointer">
            {post.title || <span className="text-[#9398A1]">Untitled</span>}
          </button>
        </td>
      )
      case 'thumb': return (
        <td key={key} className="px-2 py-1.5">
          {thumb ? (
            <button onClick={() => onSelect(post)} className="block cursor-pointer" aria-label="Open post">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb.url!} alt="" className="w-9 h-9 rounded-md object-cover border border-[#ECECEE]" />
            </button>
          ) : (post.media?.length ?? 0) > 0 ? (
            <ImageIcon size={16} className="text-[#9398A1]" aria-label="Has media" />
          ) : (
            <span className="text-[#C0C4CC]">—</span>
          )}
        </td>
      )
      case 'client': return (
        <td key={key} className="px-2 py-1.5 whitespace-nowrap text-[#5A5E66]">
          <span className="inline-flex items-center gap-1.5">
            {client && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: client.colour }} />}
            {client?.name ?? '—'}
          </span>
        </td>
      )
      case 'scheduled': return <td key={key} className="px-2 py-1.5 whitespace-nowrap text-[#5A5E66]">{scheduled}</td>
      case 'platform': return <td key={key} className="px-2 py-1.5 capitalize text-[#5A5E66]">{platform}</td>
      case 'caption': return (
        <td key={key} className="px-2 py-1.5">
          {post.body
            ? <div className="text-[#5A5E66] line-clamp-2 max-w-[280px] whitespace-pre-line" title={post.body}>{post.body}</div>
            : <span className="text-[#C0C4CC]">—</span>}
        </td>
      )
      case 'designer': return (
        <td key={key} className="px-2 py-1.5">
          <select value={meta.designer_id ?? ''} onChange={(e) => commit({ designer_id: e.target.value || null })} className={cellInput}>
            <option value="">—</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </td>
      )
      case 'design_status': return (
        <td key={key} className="px-2 py-1.5">
          <input
            value={meta.design_status ?? ''}
            onChange={(e) => setMeta((m) => ({ ...m, design_status: e.target.value || null }))}
            onBlur={() => commit({ design_status: meta.design_status })}
            className={cellInput}
            placeholder="—"
          />
        </td>
      )
      case 'status': return (
        <td key={key} className="px-2 py-1.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[#5A5E66]">
            <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />{s.label}
          </span>
        </td>
      )
      case 'boost': return (
        <td key={key} className="px-2 py-1.5 text-center">
          <input type="checkbox" checked={meta.boost} onChange={(e) => commit({ boost: e.target.checked })} className="cursor-pointer" />
        </td>
      )
      case 'ad_budget': return (
        <td key={key} className="px-2 py-1.5">
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
      )
      case 'drive': return <td key={key} className="px-2 py-1.5"><UrlCell value={meta.drive_url} onSet={(v) => setMeta((m) => ({ ...m, drive_url: v }))} onCommit={() => commit({ drive_url: meta.drive_url })} /></td>
      case 'high_res': return <td key={key} className="px-2 py-1.5"><UrlCell value={meta.high_res_url} onSet={(v) => setMeta((m) => ({ ...m, high_res_url: v }))} onCommit={() => commit({ high_res_url: meta.high_res_url })} /></td>
      case 'posted': return <td key={key} className="px-2 py-1.5 text-[#5A5E66]">{isPosted(post) ? 'Yes' : 'No'}</td>
      case 'posted_url': return <td key={key} className="px-2 py-1.5"><UrlCell value={meta.posted_url} onSet={(v) => setMeta((m) => ({ ...m, posted_url: v }))} onCommit={() => commit({ posted_url: meta.posted_url })} /></td>
      case 'date_posted': return (
        <td key={key} className="px-2 py-1.5">
          <input type="date" value={meta.date_posted ?? ''} onChange={(e) => commit({ date_posted: e.target.value || null })} className={cellInput} />
        </td>
      )
      case 'pm': return <td key={key} className="px-2 py-1.5 text-[#5A5E66] whitespace-nowrap">{pmName ?? '—'}</td>
      default: return <td key={key} />
    }
  }

  return (
    <tr className={`border-b border-[#ECECEE] last:border-b-0 hover:bg-[#FBFBFC] ${saving ? 'opacity-70' : ''}`}>
      {visibleCols.map((c) => cell(c.key))}
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

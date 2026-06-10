// Client data export — a ZIP of CSVs, assembled in the browser through the user's own
// session so every read is RLS-respecting (NEVER service-role). Used as the "back up
// before you delete" step in the client Danger zone.

import { zipSync, strToU8 } from 'fflate'
import { createClient } from '@/lib/supabase/client'
import { todayMalta } from '@/lib/week'

// ---- CSV encoding (RFC 4180) ----
// Quote a field only when it contains a quote, comma, CR or LF; double any quotes.
// Never hand-rolled join-with-commas — bodies have commas/quotes/newlines.
function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type Column = { key: string; header: string }

function toCSV(columns: Column[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => csvField(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvField(r[c.key])).join(','))
  // CRLF line breaks per the spec; trailing newline so the file ends cleanly.
  return lines.join('\r\n') + '\r\n'
}

// Leading BOM so Excel reads UTF-8 (accents in names/bodies) correctly.
const BOM = '﻿'

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client'
}

function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// Reads the client + everything attached (RLS-scoped), builds one CSV per entity, zips,
// and triggers a download. Returns { error } rather than throwing so callers can surface it.
export async function exportClientBundle(
  clientId: string,
  clientName: string,
): Promise<{ error: string | null }> {
  const supabase = createClient()

  // --- reads (all through the session → RLS applies) ---
  const { data: client, error: cErr } = await supabase
    .from('client')
    .select('id, name, status, website, industry, timezone, brand_colour, calendar_colour, created_at')
    .eq('id', clientId)
    .maybeSingle()
  if (cErr) return { error: cErr.message }
  if (!client) return { error: 'Client not found, or you do not have access.' }

  const [{ data: contacts }, { data: postsRaw }, { data: tasks }, { data: team }] = await Promise.all([
    supabase.from('client_contact')
      .select('id, first_name, surname, role, email, phone, is_primary, portal_access')
      .eq('client_id', clientId).order('created_at'),
    supabase.from('content_item')
      .select('id, title, status, content_type, scheduled_at, created_at, channel:channel_id ( type, label )')
      .eq('client_id', clientId).order('scheduled_at'),
    supabase.from('task')
      .select('id, title, task_type, status, priority, owner_id, due_date, next_action, notes, created_at')
      .eq('client_id', clientId).order('created_at'),
    supabase.from('team_member').select('id, user_id, full_name'),
  ])

  const posts = postsRaw ?? []
  const postIds = posts.map((p: any) => p.id)
  const postTitleById = new Map<string, string>(posts.map((p: any) => [p.id, p.title ?? '']))

  // Comments + internal notes are scoped to this client's posts.
  const [{ data: comments }, { data: notes }] = await Promise.all([
    postIds.length
      ? supabase.from('comment').select('id, content_item_id, author_id, body, created_at')
          .in('content_item_id', postIds).order('created_at')
      : Promise.resolve({ data: [] as any[] }),
    postIds.length
      ? supabase.from('internal_note').select('id, parent_id, author_id, body, created_at, updated_at')
          .eq('parent_type', 'post').in('parent_id', postIds).order('created_at')
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Name resolution: team_member.id → name (task owner); user_id → name (comment/note author).
  const nameByMemberId = new Map<string, string>()
  const nameByUserId = new Map<string, string>()
  for (const t of team ?? []) {
    if ((t as any).id) nameByMemberId.set((t as any).id, (t as any).full_name)
    if ((t as any).user_id) nameByUserId.set((t as any).user_id, (t as any).full_name)
  }

  // --- assemble rows ---
  const clientRows = [{
    id: client.id, name: client.name, status: client.status, website: (client as any).website,
    industry: (client as any).industry, timezone: client.timezone, brand_colour: client.brand_colour,
    calendar_colour: (client as any).calendar_colour, created_at: client.created_at,
  }]

  const contactRows = (contacts ?? []).map((c: any) => ({
    id: c.id, first_name: c.first_name, surname: c.surname, role: c.role, email: c.email,
    phone: c.phone, is_primary: c.is_primary, portal_access: c.portal_access,
  }))

  const postRows = posts.map((p: any) => {
    const ch = first<any>(p.channel)
    return {
      id: p.id, title: p.title, status: p.status, content_type: p.content_type,
      scheduled_at: p.scheduled_at, channel_type: ch?.type ?? '', channel_label: ch?.label ?? '',
      created_at: p.created_at,
    }
  })

  const commentRows = (comments ?? []).map((c: any) => ({
    id: c.id, post_id: c.content_item_id, post_title: postTitleById.get(c.content_item_id) ?? '',
    author_id: c.author_id, author_name: c.author_id ? nameByUserId.get(c.author_id) ?? '' : '',
    body: c.body, created_at: c.created_at,
  }))

  const noteRows = (notes ?? []).map((n: any) => ({
    id: n.id, post_id: n.parent_id, post_title: postTitleById.get(n.parent_id) ?? '',
    author_id: n.author_id, author_name: n.author_id ? nameByUserId.get(n.author_id) ?? '' : '',
    body: n.body, created_at: n.created_at, updated_at: n.updated_at,
  }))

  const taskRows = (tasks ?? []).map((t: any) => ({
    id: t.id, title: t.title, task_type: t.task_type, status: t.status, priority: t.priority,
    owner_id: t.owner_id, owner_name: t.owner_id ? nameByMemberId.get(t.owner_id) ?? '' : '',
    due_date: t.due_date, next_action: t.next_action, notes: t.notes, created_at: t.created_at,
  }))

  // --- CSVs ---
  const files: Record<string, Uint8Array> = {
    'client.csv': strToU8(BOM + toCSV(
      [['id'], ['name'], ['status'], ['website'], ['industry'], ['timezone'], ['brand_colour'], ['calendar_colour'], ['created_at']]
        .map(([k]) => ({ key: k, header: k })), clientRows)),
    'contacts.csv': strToU8(BOM + toCSV(
      [['id'], ['first_name'], ['surname'], ['role'], ['email'], ['phone'], ['is_primary'], ['portal_access']]
        .map(([k]) => ({ key: k, header: k })), contactRows)),
    'posts.csv': strToU8(BOM + toCSV(
      [['id'], ['title'], ['status'], ['content_type'], ['scheduled_at'], ['channel_type'], ['channel_label'], ['created_at']]
        .map(([k]) => ({ key: k, header: k })), postRows)),
    'comments.csv': strToU8(BOM + toCSV(
      [['id'], ['post_id'], ['post_title'], ['author_id'], ['author_name'], ['body'], ['created_at']]
        .map(([k]) => ({ key: k, header: k })), commentRows)),
    'internal_notes.csv': strToU8(BOM + toCSV(
      [['id'], ['post_id'], ['post_title'], ['author_id'], ['author_name'], ['body'], ['created_at'], ['updated_at']]
        .map(([k]) => ({ key: k, header: k })), noteRows)),
    'tasks.csv': strToU8(BOM + toCSV(
      [['id'], ['title'], ['task_type'], ['status'], ['priority'], ['owner_id'], ['owner_name'], ['due_date'], ['next_action'], ['notes'], ['created_at']]
        .map(([k]) => ({ key: k, header: k })), taskRows)),
  }

  // --- zip + download ---
  try {
    const zipped = zipSync(files)
    const blob = new Blob([zipped as BlobPart], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(clientName)}-export-${todayMalta()}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to build the export.' }
  }

  return { error: null }
}

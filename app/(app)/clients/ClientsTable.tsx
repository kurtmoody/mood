'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { setClientStatusAction, deleteClientFromListAction } from './clientListActions'
import { exportClientBundle } from '@/lib/exportClient'

type Contact = { first_name: string | null; surname: string | null; email: string | null }
export type Client = {
  id: string
  name: string
  status: string | null
  industry: string | null
  primary_contact: Contact[] | null
}

const CLIENT_STATUS: Record<string, { dot: string; label: string }> = {
  prospect: { dot: '#3B82F6', label: 'Prospect' },
  active:   { dot: '#16A34A', label: 'Active' },
  paused:   { dot: '#E8920C', label: 'Paused' },
  archived: { dot: '#A6ABB3', label: 'Archived' },
}

const headerCls = 'grid grid-cols-[1.6fr_1fr_1.6fr_auto] gap-4 px-5 py-2.5 border-b border-[#ECECEE] text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold'
const rowCls = 'relative grid grid-cols-[1.6fr_1fr_1.6fr_auto] gap-4 px-5 py-3.5 border-b border-[#ECECEE] last:border-b-0 items-center hover:bg-[#FBFBFC] transition'

export default function ClientsTable({ rows, isAdmin }: { rows: Client[]; isAdmin: boolean }) {
  const router = useRouter()
  const [menuId, setMenuId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(c: Client, status: string) {
    setBusyId(c.id); setError(null)
    const r = await setClientStatusAction(c.id, status)
    setBusyId(null); setMenuId(null); setArchiveTarget(null)
    if (r.error) setError(r.error)
    else router.refresh()
  }

  function reactivate(c: Client) {
    setMenuId(null)
    if (confirm(`Reactivate ${c.name}? They'll return to the active list.`)) setStatus(c, 'active')
  }

  return (
    <div className="border border-[#ECECEE] rounded-2xl bg-white overflow-visible">
      {error && <div className="px-5 py-2.5 text-sm text-red-600 border-b border-[#ECECEE]">{error}</div>}
      <div className={headerCls}>
        <div>Client</div>
        <div>Industry</div>
        <div>Primary contact</div>
        <div className="text-right">Actions</div>
      </div>

      {rows.map((c) => {
        const s = CLIENT_STATUS[c.status ?? ''] ?? { dot: '#A6ABB3', label: c.status ?? 'Unknown' }
        const contact = c.primary_contact?.[0] ?? null
        const isArchived = c.status === 'archived'
        return (
          <div key={c.id} className={rowCls}>
            {/* display:contents → the Link's children become the first three grid cells,
                so the whole info area navigates but the Actions cell (outside it) does not. */}
            <Link href={`/clients/${c.id}`} className="contents">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#5A5E66] border border-[#ECECEE] rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                  {s.label}
                </span>
              </div>
              <div className="text-sm text-[#5A5E66]">{c.industry ?? '—'}</div>
              <div className="text-sm">
                {contact ? (
                  <>
                    <span>{[contact.first_name, contact.surname].filter(Boolean).join(' ') || '—'}</span>
                    {contact.email && <span className="text-[#9398A1]"> · {contact.email}</span>}
                  </>
                ) : (
                  <span className="text-[#9398A1]">—</span>
                )}
              </div>
            </Link>

            <div className="flex justify-end">
              <button
                type="button"
                aria-label="Actions"
                onClick={() => setMenuId((m) => (m === c.id ? null : c.id))}
                className="p-1.5 rounded-lg text-[#9398A1] hover:bg-[#F4F4F6] hover:text-[#15171C]"
              >
                <MoreHorizontal size={16} />
              </button>

              {menuId === c.id && (
                <div className="absolute right-5 top-12 z-20 w-44 bg-white border border-[#ECECEE] rounded-xl shadow-lg p-1.5 text-sm">
                  {isArchived ? (
                    <button onClick={() => reactivate(c)} disabled={busyId === c.id} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F4F4F6] disabled:opacity-50">
                      Reactivate
                    </button>
                  ) : (
                    <button onClick={() => { setMenuId(null); setArchiveTarget(c) }} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F4F4F6]">
                      Archive
                    </button>
                  )}
                  {isAdmin && isArchived && (
                    <button onClick={() => { setMenuId(null); setDeleteTarget(c) }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50">
                      Delete permanently
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* click-away to close an open menu */}
      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}

      {archiveTarget && (
        <ArchiveConfirm
          client={archiveTarget}
          busy={busyId === archiveTarget.id}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => setStatus(archiveTarget, 'archived')}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function ArchiveConfirm({ client, busy, onCancel, onConfirm }: { client: Client; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 animate-overlay-in" role="dialog" aria-modal="true" aria-label={`Archive ${client.name}?`} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#ECECEE] shadow-xl p-6 animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold mb-2">Archive {client.name}?</div>
        <p className="text-sm text-[#5A5E66] mb-4">They&rsquo;ll be hidden from the active list. You can reactivate any time.</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-[#5A5E66] rounded-lg px-4 py-2 font-medium hover:bg-[#FBFBFC]">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ client, onClose, onDeleted }: { client: Client; onClose: () => void; onDeleted: () => void }) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const canDelete = confirmText === client.name

  async function onExport() {
    setExporting(true); setExportError(null)
    const r = await exportClientBundle(client.id, client.name)
    setExporting(false)
    if (r.error) setExportError(r.error)
  }

  async function onDelete() {
    if (!canDelete || deleting) return
    setDeleting(true); setDeleteError(null)
    const r = await deleteClientFromListAction(client.id)
    setDeleting(false)
    if (r.error) setDeleteError(r.error)
    else onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 animate-overlay-in" role="dialog" aria-modal="true" aria-label={`Delete ${client.name} permanently`} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECECEE] shadow-xl p-6 animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold mb-2">Delete {client.name} permanently</div>

        {/* Step 1 — back up first. */}
        <div className="rounded-xl border border-[#ECECEE] bg-[#FBFBFC] p-4 mb-4">
          <div className="text-sm font-semibold mb-1">1. Export client data</div>
          <p className="text-sm text-[#5A5E66] mb-3">
            Download a backup of this client&rsquo;s data before deleting. This is your only chance — deletion is permanent.
          </p>
          <button type="button" onClick={onExport} disabled={exporting} className="text-sm border border-[#E2E2E5] rounded-lg px-4 py-2 font-medium hover:bg-white disabled:opacity-50">
            {exporting ? 'Preparing…' : 'Export client data (ZIP)'}
          </button>
          {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
        </div>

        {/* Step 2 — type the name to confirm. */}
        <div className="text-sm font-semibold mb-1">2. Confirm</div>
        <p className="text-sm text-[#5A5E66] mb-3">
          This permanently deletes {client.name} and all their posts, comments, notes, and tasks. This cannot be undone.
          Type the client&rsquo;s name to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={client.name}
          className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2 text-sm bg-white mb-3"
        />
        {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-[#5A5E66] rounded-lg px-4 py-2 font-medium hover:bg-[#FBFBFC]">Cancel</button>
          <button onClick={onDelete} disabled={!canDelete || deleting} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

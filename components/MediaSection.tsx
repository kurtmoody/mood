'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { mediaKind, mediaName } from '@/lib/media'
import type { Media } from './Calendar'

const BUCKET = 'content-media'
const ACCEPT = 'image/*,video/mp4,application/pdf'

// <client_id>/<content_item_id>/<version_id>/<sanitised-filename> — must match the
// 0018 storage policies. Filename: lowercased, special chars stripped, extension kept.
function sanitise(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  let base = (dot >= 0 ? name.slice(0, dot) : name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  if (!base) base = 'file'
  return ext ? `${base}.${ext}` : base
}

function Placeholder() {
  return <div className="w-full h-32 rounded-lg bg-[#F4F4F6] grid place-items-center text-[#9398A1] text-xs">Preview unavailable</div>
}

function MediaItem({ m, isAgency, onRemove }: { m: Media; isAgency: boolean; onRemove: (m: Media) => void }) {
  const kind = mediaKind(m.mime_type)
  return (
    <div className="relative">
      {isAgency && (
        <button
          onClick={() => onRemove(m)}
          aria-label="Remove"
          className="absolute top-2 right-2 z-10 w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white text-xs hover:bg-black/80 cursor-pointer"
        >
          ×
        </button>
      )}
      {kind === 'image' && (m.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={m.url} alt="" loading="lazy" className="w-full rounded-lg border border-[#ECECEE]" />
        : <Placeholder />)}
      {kind === 'video' && (m.url
        ? <video src={m.url} controls className="w-full rounded-lg border border-[#ECECEE] bg-black" />
        : <Placeholder />)}
      {kind === 'pdf' && (m.url
        ? <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm border border-[#ECECEE] rounded-lg px-3 py-2.5 hover:bg-[#F4F4F6]">📄 <span className="truncate">{mediaName(m.storage_path)}</span></a>
        : <Placeholder />)}
      {kind === 'other' && <Placeholder />}
    </div>
  )
}

export default function MediaSection({
  media,
  isAgency,
  clientId,
  contentItemId,
  versionId,
}: {
  media: Media[]
  isAgency: boolean
  clientId: string
  contentItemId: string
  versionId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setStaged((cur) => [...cur, ...Array.from(list)])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function upload() {
    if (!versionId || staged.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of staged) {
        const rand = Math.random().toString(36).slice(2, 8)
        const path = `${clientId}/${contentItemId}/${versionId}/${rand}-${sanitise(file.name)}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        const { error: rpcErr } = await supabase.rpc('add_media', {
          p_version_id: versionId,
          p_storage_path: path,
          p_mime_type: file.type || null,
          p_size_bytes: file.size,
        })
        if (rpcErr) {
          // The DB row failed — remove the just-uploaded object so it isn't orphaned.
          await supabase.storage.from(BUCKET).remove([path])
          throw rpcErr
        }
      }
      setStaged([])
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function removeMedia(m: Media) {
    if (!confirm('Remove this file?')) return
    setError(null)
    const { error: delErr } = await supabase.rpc('delete_media', { p_media_id: m.id })
    if (delErr) {
      setError(delErr.message)
      return
    }
    // Remove the DB row first (authoritative), then the object — avoids orphans.
    await supabase.storage.from(BUCKET).remove([m.storage_path])
    router.refresh()
  }

  return (
    <div className="mt-7 pt-5 border-t border-[#ECECEE]">
      <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-3">Media</div>

      {media.length === 0 ? (
        <div className="text-sm text-[#9398A1]">No media yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {media.map((m) => <MediaItem key={m.id} m={m} isAgency={isAgency} onRemove={removeMedia} />)}
        </div>
      )}

      {isAgency && (
        <div className="mt-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => addFiles(e.target.files)}
            className="block w-full text-sm text-[#5A5E66] file:mr-3 file:rounded-lg file:border-0 file:bg-[#F4F4F6] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#15171C]"
          />
          {staged.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {staged.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <button
                    onClick={() => setStaged((cur) => cur.filter((_, idx) => idx !== i))}
                    aria-label="Remove"
                    className="text-[#9398A1] hover:text-[#E0572E] cursor-pointer"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!versionId && <p className="text-xs text-[#9398A1] mt-2">This post has no version to attach media to.</p>}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <button
            onClick={upload}
            disabled={busy || staged.length === 0 || !versionId}
            className="mt-3 bg-[#15171C] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Uploading…' : `Upload${staged.length ? ` (${staged.length})` : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import VersionHistory from './VersionHistory'
import type { VersionDetail } from './Calendar'

// Client-side version history: the embedded query is RLS-restricted to current-status-
// visible versions, so clients fetch their history via get_post_versions (which returns
// only versions ever sent to them, with internal_note already nulled), then sign the
// media paths. VersionHistory renders nothing when there's ≤1 visible version.
export default function ClientVersionHistory({ itemId }: { itemId: string }) {
  const [versions, setVersions] = useState<VersionDetail[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data, error } = await supabase.rpc('get_post_versions', { p_item_id: itemId })
      if (error || !data || cancelled) return

      const mapped: VersionDetail[] = (data as any[]).map((r) => ({
        id: r.version_id,
        version_no: r.version_no,
        body: r.body,
        created_at: r.created_at,
        author: null, // clients don't resolve agency names
        isCurrent: r.is_current,
        media: (r.media ?? []).map((m: any) => ({
          id: m.id, storage_path: m.storage_path, mime_type: m.mime_type, created_at: r.created_at, url: null as string | null,
        })),
        events: (r.events ?? []).map((e: any) => ({ action: e.action, created_at: e.created_at })),
      }))

      // Sign media via the client's session — the storage policy gates it; a path it
      // can't sign just stays null (placeholder), same as elsewhere.
      const paths = mapped.flatMap((v) => v.media.map((m) => m.storage_path))
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('content-media').createSignedUrls(paths, 3600)
        const urlByPath = new Map<string, string>()
        for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
        for (const v of mapped) for (const m of v.media) m.url = urlByPath.get(m.storage_path) ?? null
      }

      if (!cancelled) setVersions(mapped)
    })()
    return () => { cancelled = true }
  }, [itemId])

  return <VersionHistory versions={versions} />
}

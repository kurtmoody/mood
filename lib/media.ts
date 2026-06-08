export type MediaKind = 'image' | 'video' | 'pdf' | 'other'

export function mediaKind(mime: string | null): MediaKind {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'other'
}

// Display name: the last path segment with the short random upload prefix stripped.
export function mediaName(storagePath: string): string {
  const last = storagePath.split('/').pop() ?? storagePath
  return last.replace(/^[a-z0-9]{4,8}-/i, '')
}

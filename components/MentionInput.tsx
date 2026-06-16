'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type MentionCandidate = { userId: string; name: string }

// A controlled textarea with an @-mention picker. Typing "@" (at the start or after a space)
// opens a dropdown of candidates filtered by the text after the @; picking one inserts
// "@Name " and records that person's user_id. The authoritative mentions are the selected
// ids (exposed via onMentionsChange), NOT parsed from the text — though ids whose "@Name" is
// later deleted are pruned. Style is the caller's via `className`.
export default function MentionInput({
  value,
  onChange,
  onMentionsChange,
  candidates,
  rows = 2,
  placeholder,
  className,
}: {
  value: string
  onChange: (text: string) => void
  onMentionsChange: (userIds: string[]) => void
  candidates: MentionCandidate[]
  rows?: number
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null) // active @-token text, null = closed
  const [active, setActive] = useState(0)                  // highlighted candidate index
  const [selected, setSelected] = useState<MentionCandidate[]>([]) // picked, deduped by userId

  // When the parent clears the text (e.g. after submit), drop any stale selection.
  useEffect(() => {
    if (value === '') setSelected((s) => (s.length ? [] : s))
  }, [value])

  // Recompute the active @-token from the text up to the caret.
  function syncQuery(text: string, caret: number) {
    const m = text.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
    setQuery(m ? m[1] : null)
    setActive(0)
  }

  // Keep only mentions whose "@Name" still appears, then report the deduped ids.
  function reconcile(text: string, list: MentionCandidate[]) {
    const kept = list.filter((c) => text.includes('@' + c.name))
    setSelected(kept)
    onMentionsChange([...new Set(kept.map((c) => c.userId))])
  }

  const matches = useMemo(() => {
    if (query == null) return []
    const q = query.toLowerCase()
    return candidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [query, candidates])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    onChange(text)
    syncQuery(text, e.target.selectionStart ?? text.length)
    reconcile(text, selected)
  }

  function pick(c: MentionCandidate) {
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const before = value.slice(0, caret).replace(/(^|\s)@([^\s@]*)$/, `$1@${c.name} `)
    const next = before + value.slice(caret)
    onChange(next)
    setQuery(null)
    reconcile(next, selected.some((s) => s.userId === c.userId) ? selected : [...selected, c])
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(before.length, before.length)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query == null || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(null) }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {query != null && matches.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-44 overflow-y-auto bg-white border border-[#ECECEE] rounded-xl shadow-lg p-1">
          {matches.map((c, i) => (
            <button
              key={c.userId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(c) }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm cursor-pointer ${i === active ? 'bg-[#F4F4F6]' : 'hover:bg-[#F4F4F6]'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

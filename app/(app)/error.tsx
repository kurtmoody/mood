'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="mx-auto w-full max-w-md py-24 text-center animate-pop-in">
      <h2 className="text-lg font-bold mb-1">Something went wrong</h2>
      <p className="text-sm text-muted mb-6">
        That page failed to load. It&rsquo;s usually temporary — try again, and if it keeps happening let the team know.
      </p>
      <button
        onClick={reset}
        className="bg-ink text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-black cursor-pointer"
      >
        Try again
      </button>
    </div>
  )
}

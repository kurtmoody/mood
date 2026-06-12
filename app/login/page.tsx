'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-surface text-ink px-4">
      <div className="w-full max-w-[360px] animate-pop-in">
        <div className="border border-line rounded-2xl bg-white p-8 shadow-[0_1px_2px_rgba(21,23,28,0.04),0_8px_24px_rgba(21,23,28,0.06)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mood" className="h-8 w-auto mb-5" />
          {sent ? (
            <div>
              <h1 className="text-lg font-bold mb-1">Check your email</h1>
              <p className="text-sm text-muted leading-relaxed">
                We&rsquo;ve sent a magic link to <span className="font-medium text-ink">{email}</span>.
                Click it to log in — you can close this tab.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-5 text-sm text-muted underline underline-offset-4 hover:text-ink cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold mb-1">Welcome back</h1>
              <p className="text-sm text-muted mb-6">Enter your email and we&rsquo;ll send you a magic link.</p>
              <form onSubmit={send}>
                <label htmlFor="email" className="block text-[11px] uppercase tracking-wide text-faint font-semibold mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-line-strong rounded-lg px-3 py-2.5 text-sm mb-3 focus:border-ink"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-ink text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-black disabled:opacity-60 cursor-pointer"
                >
                  {sending ? 'Sending…' : 'Send magic link'}
                </button>
                {error && <p className="text-xs text-accent mt-3">{error}</p>}
              </form>
            </>
          )}
        </div>
        <p className="text-xs text-faint text-center mt-6">No passwords. The link logs you straight in.</p>
      </div>
    </div>
  )
}

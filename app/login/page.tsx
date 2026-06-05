'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function send() {
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[#FBFBFC] text-[#15171C]">
      <div className="w-[340px] border border-[#ECECEE] rounded-2xl bg-white p-7 shadow-sm">
        <div className="font-bold text-lg mb-1">Mood</div>
        <p className="text-sm text-[#5A5E66] mb-5">Log in with a magic link.</p>
        {sent ? (
          <p className="text-sm">Check your email — click the link to log in.</p>
        ) : (
          <>
            <input
              className="w-full border border-[#E2E2E5] rounded-lg px-3 py-2.5 text-sm mb-3"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={send}
              className="w-full bg-[#15171C] text-white rounded-lg py-2.5 text-sm font-semibold"
            >
              Send magic link
            </button>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}

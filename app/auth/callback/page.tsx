'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Callback() {
  const router = useRouter()
  const [msg] = useState('Signing you in…')

  useEffect(() => {
    const supabase = createClient()
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)

    // Idempotent on every login, never blocks login on failure. Two grant paths:
    // - accept_pending_invites: agency/client memberships backed by a pending invite.
    // - claim_client_access: legacy portal-access contacts matched by email.
    // Both derive everything server-side from auth.uid(); neither takes a parameter.
    async function claimThenHome() {
      try {
        const { error } = await supabase.rpc('accept_pending_invites')
        if (error) console.error('accept_pending_invites failed:', error.message)
      } catch (e) {
        console.error('accept_pending_invites threw:', e)
      }
      try {
        const { error } = await supabase.rpc('claim_client_access')
        if (error) console.error('claim_client_access failed:', error.message)
      } catch (e) {
        console.error('claim_client_access threw:', e)
      }
      router.replace('/')
    }

    async function run() {
      if (hash.get('error') || query.get('error')) {
        router.replace('/login?error=expired')
        return
      }
      const access_token = hash.get('access_token')
      const refresh_token = hash.get('refresh_token')
      const code = query.get('code')

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (!error) return claimThenHome()
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) return claimThenHome()
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) return claimThenHome()
      router.replace('/login?error=auth')
    }
    run()
  }, [router])

  return (
    <div className="min-h-screen grid place-items-center text-sm text-[#5A5E66]">{msg}</div>
  )
}

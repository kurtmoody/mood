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

    // Idempotent: grants client_approver membership for any portal-enabled contact
    // whose email matches this user. Safe for agency users (0 grants). We await it
    // so membership exists before the app loads, but never block login on a failure.
    async function claimThenHome() {
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

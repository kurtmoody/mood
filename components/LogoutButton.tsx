'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const supabase = createClient()
  const router = useRouter()
  return (
    <button
      onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
      className="text-sm text-[#5A5E66] border border-[#E2E2E5] rounded-lg px-3 py-1.5"
    >
      Log out
    </button>
  )
}

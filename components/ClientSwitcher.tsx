'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type ClientOption = { id: string; name: string }

export default function ClientSwitcher({ clients, current }: { clients: ClientOption[]; current: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function change(id: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('client', id)
    router.push(`/?${sp.toString()}`)
  }

  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      className="text-xl font-bold bg-transparent border border-[#ECECEE] rounded-lg pl-3 pr-8 py-1.5 cursor-pointer hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#15171C]/15"
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

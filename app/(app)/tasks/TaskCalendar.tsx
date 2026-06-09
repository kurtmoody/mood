'use client'

import { useState } from 'react'
import { addMonths, monthGridDates, monthLabel, monthOf, todayMalta } from '@/lib/week'
import { taskToday, type Task } from './types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Tasks plotted by due_date on a Europe/Malta month grid (reuses lib/week). due_date is a
// plain date string, so it buckets directly against the grid dates. Undated → a tray.
export default function TaskCalendar({ tasks, onEdit }: { tasks: Task[]; onEdit: (task: Task) => void }) {
  const [month, setMonth] = useState(() => monthOf(todayMalta()))
  const today = taskToday()
  const grid = monthGridDates(month)

  const byDate = new Map<string, Task[]>()
  const noDate: Task[] = []
  for (const t of tasks) {
    if (!t.due_date) { noDate.push(t); continue }
    const arr = byDate.get(t.due_date)
    if (arr) arr.push(t)
    else byDate.set(t.due_date, [t])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{monthLabel(month)}</div>
        <div className="flex items-center rounded-lg border border-[#E2E2E5] overflow-hidden text-sm text-[#5A5E66]">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous" className="px-2.5 py-1.5 hover:bg-[#F4F4F6]">‹</button>
          <button onClick={() => setMonth(monthOf(todayMalta()))} className="px-3 py-1.5 border-x border-[#E2E2E5] hover:bg-[#F4F4F6]">Today</button>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next" className="px-2.5 py-1.5 hover:bg-[#F4F4F6]">›</button>
        </div>
      </div>

      <div className="w-full border border-[#ECECEE] rounded-2xl bg-white overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 border-b border-[#ECECEE]">
            {DAYS.map((d) => <div key={d} className="px-3 py-2.5 text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold border-r border-[#ECECEE] last:border-r-0">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((date) => {
              const inMonth = monthOf(date) === month
              const isToday = date === today
              const items = byDate.get(date) ?? []
              return (
                <div key={date} className={`min-h-[110px] border-r border-b border-[#ECECEE] [&:nth-child(7n)]:border-r-0 p-1.5 flex flex-col gap-1 ${isToday ? 'bg-[#F2F6FF]' : inMonth ? '' : 'bg-[#FBFBFC]'}`}>
                  <div className="px-1 text-[12px]">
                    <span className={isToday ? 'inline-grid place-items-center w-5 h-5 rounded-full bg-[#15171C] text-white font-semibold' : inMonth ? 'text-[#15171C]' : 'text-[#C0C4CC]'}>{Number(date.slice(8, 10))}</span>
                  </div>
                  {items.map((t) => {
                    const overdue = t.due_date! < today && t.status !== 'Complete'
                    return (
                      <button key={t.id} onClick={() => onEdit(t)} className={`flex items-center gap-1.5 w-full text-left rounded-md px-1.5 py-1 text-[11px] cursor-pointer hover:bg-[#F4F4F6] ${overdue ? 'text-[#E0572E] font-medium' : ''}`}>
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: t.clientColour ?? '#A6ABB3' }} />
                        <span className="truncate min-w-0">{t.title}{t.ownerName && <span className="text-[#9398A1]"> · {t.ownerName}</span>}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {noDate.length > 0 && (
        <div className="border border-[#ECECEE] rounded-2xl bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">No date ({noDate.length})</div>
          <div className="flex flex-wrap gap-2">
            {noDate.map((t) => (
              <button key={t.id} onClick={() => onEdit(t)} className="inline-flex items-center gap-1.5 border border-[#ECECEE] rounded-lg px-2 py-1 text-[12px] hover:bg-[#F4F4F6] cursor-pointer">
                <span className="w-2 h-2 rounded-sm" style={{ background: t.clientColour ?? '#A6ABB3' }} />
                <span className="truncate max-w-[160px]">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

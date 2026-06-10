'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TASK_STATUSES, STATUS_COLOUR, PRIORITY_COLOUR } from '@/lib/taskConstants'
import { fmtTaskDate, taskToday, type Task } from './types'

// Native HTML5 drag-and-drop (mirrors MediaSection). Dragging a card to another column
// calls onMove(task, status); the parent does the optimistic update + update_task.
export default function TaskKanban({ tasks, onMove, onEdit }: {
  tasks: Task[]
  onMove: (task: Task, status: string) => void
  onEdit: (task: Task) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const today = taskToday()

  function onDrop(status: string) {
    const id = draggingId
    setDraggingId(null); setOverCol(null)
    if (!id) return
    const task = tasks.find((t) => t.id === id)
    if (task && task.status !== status) onMove(task, status)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {TASK_STATUSES.map((status) => {
        const cards = tasks.filter((t) => t.status === status)
        return (
          <div
            key={status}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status) }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => onDrop(status)}
            className={`w-64 shrink-0 rounded-xl border bg-[#FBFBFC] ${overCol === status ? 'border-[#15171C]/40' : 'border-[#ECECEE]'}`}
          >
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-[#ECECEE] text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOUR[status] ?? '#A6ABB3' }} />
              {status}
              <span className="ml-auto text-[#C0C4CC]">{cards.length}</span>
            </div>
            <div className="p-2 flex flex-col gap-2 min-h-[60px]">
              {cards.map((t) => {
                const overdue = t.due_date && t.due_date < today && t.status !== 'Complete'
                return (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => { setDraggingId(null); setOverCol(null) }}
                    onClick={() => onEdit(t)}
                    className={`text-left bg-white border border-[#ECECEE] rounded-lg p-2.5 shadow-sm hover:shadow-md cursor-pointer ${draggingId === t.id ? 'opacity-50' : ''} ${t.archived ? 'opacity-60' : ''}`}
                  >
                    <div className="text-sm font-medium leading-snug mb-1.5">
                      {t.title}
                      {t.archived && <span className="ml-1.5 align-middle text-[9px] uppercase tracking-wide font-semibold text-[#9398A1] border border-[#E2E2E5] rounded px-1">Archived</span>}
                    </div>
                    {t.servesPost && (
                      t.servesPost.href
                        ? <Link href={t.servesPost.href} draggable={false} onClick={(e) => e.stopPropagation()} className="block text-[11px] text-[#5A5E66] hover:underline mb-1.5">↗ {t.servesPost.title}</Link>
                        : <span className="block text-[11px] text-[#9398A1] mb-1.5">↗ {t.servesPost.title}</span>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-[#9398A1] flex-wrap">
                      {t.clientName ? (
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: t.clientColour ?? '#A6ABB3' }} />{t.clientName}</span>
                      ) : <span>Internal</span>}
                      {t.ownerName && <span>· {t.ownerName}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-[#5A5E66]"><span className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLOUR[t.priority] ?? '#9398A1' }} />{t.priority}</span>
                      <span className={overdue ? 'text-[#E0572E] font-semibold' : 'text-[#9398A1]'}>{fmtTaskDate(t.due_date)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

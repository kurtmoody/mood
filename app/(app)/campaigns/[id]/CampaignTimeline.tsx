import { STATUS_COLOUR } from '@/lib/taskConstants'
import { STATUS as CONTENT_STATUS } from '@/components/Calendar'
import type { TimelineModel } from '@/lib/campaignTimeline'

// Fixed geometry — a real Gantt scrolls horizontally rather than squeezing columns.
const LABEL_W = 200
const COL = 76
const ROW_H = 30
const HEADER_H = 28

export default function CampaignTimeline({ model }: { model: TimelineModel }) {
  const { weeks, bars, dots, unscheduled, band, truncated } = model
  const hasAxis = weeks.length > 0
  const gridW = LABEL_W + weeks.length * COL

  // Truly empty: no dated anchor AND no undated work to list.
  if (!hasAxis && unscheduled.length === 0) {
    return (
      <Card>
        <Head />
        <div className="border border-[#ECECEE] rounded-xl bg-[#FBFBFC] p-10 text-center text-sm text-[#5A5E66]">
          No dates yet. Add a campaign flight window, task dates, or scheduled posts to see a timeline.
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <Head truncated={truncated} />

      {hasAxis && (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="relative" style={{ width: gridW }}>
            {/* Flight-window band behind the rows (only when the campaign has both dates). */}
            {band && (
              <div
                className="absolute bg-[#FEF3E9] border-x border-[#F6D9BF] pointer-events-none"
                style={{
                  top: HEADER_H,
                  bottom: 0,
                  left: LABEL_W + band.startIndex * COL,
                  width: (band.endIndex - band.startIndex + 1) * COL,
                }}
              />
            )}

            {/* Header: corner + week labels. */}
            <div className="relative flex" style={{ height: HEADER_H }}>
              <div className="shrink-0 flex items-end pb-1 text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold" style={{ width: LABEL_W }}>
                {band && <span>Flight window shaded</span>}
              </div>
              {weeks.map((w) => (
                <div key={w.key} className="shrink-0 text-center text-[11px] text-[#9398A1] border-l border-[#F0F0F1] flex items-end justify-center pb-1" style={{ width: COL }}>
                  {w.label}
                </div>
              ))}
            </div>

            {/* Task bars — one row each. */}
            {bars.map((b) => {
              const owner = Array.isArray(b.ownerName) ? b.ownerName[0] : b.ownerName
              return (
                <div key={b.id} className="relative flex items-center border-t border-[#F4F4F5]" style={{ height: ROW_H }}>
                  <div className="shrink-0 min-w-0 pr-3 flex items-center gap-2" style={{ width: LABEL_W }}>
                    <span className="text-xs truncate">{b.title}</span>
                    {owner && <span className="text-[11px] text-[#9398A1] shrink-0">{owner}</span>}
                  </div>
                  <div className="relative shrink-0" style={{ width: weeks.length * COL, height: ROW_H }}>
                    {weeks.map((w, i) => (
                      <div key={w.key} className="absolute top-0 bottom-0 border-l border-[#F4F4F5]" style={{ left: i * COL, width: COL }} />
                    ))}
                    <div
                      title={`${b.title}${owner ? ` · ${owner}` : ''} · ${b.status}`}
                      className="absolute rounded-md"
                      style={{
                        left: b.startIndex * COL + 3,
                        width: b.span * COL - 6,
                        top: (ROW_H - 16) / 2,
                        height: 16,
                        background: STATUS_COLOUR[b.status] ?? '#A6ABB3',
                      }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Posts row — dots bucketed into their scheduled week (no overlap). */}
            <div className="relative flex items-center border-t border-[#ECECEE]" style={{ minHeight: ROW_H }}>
              <div className="shrink-0 text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold" style={{ width: LABEL_W }}>
                Posts
              </div>
              <div className="flex shrink-0" style={{ width: weeks.length * COL }}>
                {weeks.map((w, i) => (
                  <div key={w.key} className="shrink-0 border-l border-[#F4F4F5] flex items-center justify-center flex-wrap gap-1 py-1.5" style={{ width: COL, minHeight: ROW_H }}>
                    {dots.filter((d) => d.index === i).map((d) => {
                      const colour = CONTENT_STATUS[d.status]?.dot ?? '#A6ABB3'
                      return (
                        <span
                          key={d.id}
                          title={`${d.title} · ${CONTENT_STATUS[d.status]?.label ?? d.status}`}
                          className="w-2.5 h-2.5 rounded-full"
                          style={d.posted ? { background: colour } : { background: 'white', border: `1.5px solid ${colour}` }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unscheduled honesty bucket — dated work never hides undated work. */}
      {unscheduled.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-[#9398A1] font-semibold mb-2">
            Unscheduled ({unscheduled.length}) <span className="normal-case font-normal text-[#9398A1]">· no dates set</span>
          </div>
          <div className="border border-[#ECECEE] rounded-xl bg-white overflow-hidden">
            {unscheduled.map((u) => {
              const owner = Array.isArray(u.ownerName) ? u.ownerName[0] : u.ownerName
              return (
                <div key={u.id} className="px-4 py-2.5 border-b border-[#F4F4F5] last:border-b-0 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOUR[u.status] ?? '#A6ABB3' }} />
                    <span className="text-sm truncate">{u.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-[#9398A1]">
                    {owner && <span>{owner}</span>}
                    <span>{u.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border border-[#ECECEE] rounded-2xl bg-white p-6">{children}</div>
}

function Head({ truncated }: { truncated?: boolean }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-lg font-bold">Timeline</h2>
      {truncated && <span className="text-xs text-[#C2410C]">Timeline truncated to 26 weeks</span>}
    </div>
  )
}

// Route-level skeleton shown inside the app shell while a page's server data loads.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-44 rounded-lg bg-hover" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-lg bg-hover" />
          <div className="h-9 w-28 rounded-lg bg-hover" />
        </div>
      </div>
      <div className="border border-line rounded-xl bg-white overflow-hidden">
        <div className="h-10 border-b border-line bg-surface" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="h-32 border-b border-r border-line p-3">
              <div className="h-3 w-8 rounded bg-hover mb-3" />
              {i % 3 === 0 && <div className="h-12 rounded-lg bg-hover" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

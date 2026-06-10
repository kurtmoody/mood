import type { ReactNode } from 'react'

// Page-level width container — the single source of truth for page widths.
// 'wide'   → data / table / grid pages: fluid full width, capped at 1600px so it stays
//            sane on ultrawide screens.
// 'narrow' → single-form / settings pages (and modals keep their own width).
// Responsive horizontal padding is provided by AppShell (px-4 sm:px-6 lg:px-8); this only
// caps the max-width and centres, so it's fully fluid from mobile up.
export default function PageContainer({ variant = 'wide', children }: { variant?: 'wide' | 'narrow'; children: ReactNode }) {
  return (
    <div className={`mx-auto w-full ${variant === 'narrow' ? 'max-w-2xl' : 'max-w-[1600px]'}`}>
      {children}
    </div>
  )
}

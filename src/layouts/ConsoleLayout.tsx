import type { ReactNode } from 'react'
import { DemoBanner } from '../components/DemoBanner'

export interface ConsoleLayoutProps {
  header: ReactNode
  children: ReactNode
}

/** Page shell for the console: demo banner, sticky header, content, footer. */
export function ConsoleLayout({ header, children }: ConsoleLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      {header}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-5 sm:pt-6">{children}</main>
      <footer className="border-t border-slate-800/80 px-4 py-4">
        <p className="mx-auto max-w-5xl text-center text-[11px] leading-relaxed text-slate-600">
          Apple Console · standalone demo simulation of an operator grid tool ·
          publishing only via NEW GAME · /m11 contract enforced · not affiliated
          with any betting platform
        </p>
      </footer>
    </div>
  )
}

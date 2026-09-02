import { FlaskConical } from 'lucide-react'

/** Persistent, unmissable notice that this entire app is a simulation. */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-300 sm:text-xs"
    >
      <FlaskConical aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      Demo simulation — no real money · no wagering · no betting platform
    </div>
  )
}

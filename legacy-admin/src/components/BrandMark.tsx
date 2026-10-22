import { Command } from 'lucide-react'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-300 to-teal-600 text-[#052119] shadow-[0_0_26px_rgba(70,227,161,.2)] ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}
    >
      <Command className={compact ? 'h-4 w-4' : 'h-6 w-6'} strokeWidth={2.5} />
    </span>
  )
}

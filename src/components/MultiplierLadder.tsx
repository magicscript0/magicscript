import { formatMultiplier } from '../config/game'

export interface MultiplierRungProps {
  multiplier: number
  /** True once this row's cells have been revealed. */
  revealed: boolean
  /** True while this row is the row currently being revealed. */
  active: boolean
}

function tier(multiplier: number): string {
  if (multiplier >= 100) {
    return 'border-amber-400/60 bg-gradient-to-r from-amber-500/25 to-amber-300/10 text-amber-200'
  }
  if (multiplier >= 10) {
    return 'border-orange-400/40 bg-orange-400/10 text-orange-200'
  }
  if (multiplier >= 2) {
    return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
  }
  return 'border-slate-700 bg-slate-800/60 text-slate-300'
}

/**
 * One rung of the multiplier ladder, rendered inline with each grid row so
 * the ladder is always perfectly aligned on every screen size.
 */
export function MultiplierRung({ multiplier, revealed, active }: MultiplierRungProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-9 w-[74px] shrink-0 items-center justify-center rounded-lg border text-[13px] font-bold tabular-nums transition-all duration-300 sm:h-10 sm:w-[92px] sm:text-sm ${tier(
        multiplier,
      )} ${revealed ? 'opacity-100' : 'opacity-45'} ${
        active ? 'scale-105 ring-2 ring-cyan-300/70' : 'ring-0'
      }`}
    >
      {formatMultiplier(multiplier)}
    </div>
  )
}

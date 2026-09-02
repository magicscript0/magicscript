import { formatMultiplier } from '../config/game'

export interface MultiplierRungProps { multiplier: number; revealed: boolean; active: boolean }
function tier(multiplier: number): string { if (multiplier >= 100) return 'border-amber-300/45 bg-amber-300/[.1] text-amber-200'; if (multiplier >= 10) return 'border-orange-300/35 bg-orange-300/[.08] text-orange-200'; if (multiplier >= 2) return 'border-cyan-300/25 bg-cyan-300/[.07] text-cyan-200'; return 'border-white/[.1] bg-white/[.04] text-slate-400' }
export function MultiplierRung({ multiplier, revealed, active }: MultiplierRungProps) { return <div aria-hidden="true" className={`flex h-8 w-[52px] shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold tabular-nums transition sm:h-10 sm:w-[88px] sm:text-sm ${tier(multiplier)} ${revealed ? 'opacity-100' : 'opacity-45'} ${active ? 'scale-105 ring-2 ring-cyan-300/65' : ''}`}>{formatMultiplier(multiplier)}</div> }

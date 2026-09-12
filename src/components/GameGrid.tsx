import { memo } from 'react'
import { Apple, Bomb } from 'lucide-react'
import { GRID_ROWS, ROWS } from '../config/game'
import type { RoundPhase, RoundSource, RowView } from '../types/game'
import { MultiplierRung } from './MultiplierLadder'

type CellState = 'empty' | 'hidden' | 'safe' | 'bomb'
const CELL_CLASSES: Record<CellState, string> = { empty: 'border-dashed border-white/[.08] bg-white/[.015] text-slate-700', hidden: 'border-white/[.1] bg-white/[.045] text-slate-500', safe: 'border-emerald-300/65 bg-emerald-300/[.12] text-emerald-200 shadow-[0_0_18px_rgba(70,227,161,.18),inset_0_0_12px_rgba(70,227,161,.08)]', bomb: 'border-rose-300/55 bg-rose-300/[.1] text-rose-200 shadow-[0_0_18px_rgba(251,113,133,.14),inset_0_0_12px_rgba(251,113,133,.07)]' }
const CELL_LABELS: Record<CellState, string> = { empty: 'فارغ', hidden: 'مخفي', safe: 'آمن', bomb: 'قنبلة' }

const AppleCell = memo(function AppleCell({ state, label, animate }: { state: CellState; label: string | null; animate: boolean }) {
  const animation = animate && (state === 'safe' || state === 'bomb') ? 'animate-pop-in' : ''
  return <div role={label === null ? undefined : 'img'} aria-label={label === null ? undefined : `${label} — ${CELL_LABELS[state]}`} aria-hidden={label === null ? true : undefined} className={`flex aspect-square min-w-0 w-full items-center justify-center rounded-lg border transition-colors duration-200 sm:rounded-xl ${CELL_CLASSES[state]} ${animation}`}><span className="flex items-center justify-center"><>{state === 'bomb' ? <Bomb aria-hidden="true" className="h-4 w-4 sm:h-6 sm:w-6" strokeWidth={2.2} /> : <Apple aria-hidden="true" className={`h-4 w-4 sm:h-6 sm:w-6 ${state === 'hidden' || state === 'empty' ? 'opacity-40' : ''}`} strokeWidth={2.2} />}</></span></div>
})

export interface GameGridProps { rows: readonly RowView[] | null; phase: RoundPhase; revealedRows: number; nextSource?: RoundSource }
export function GameGrid({ rows, phase, revealedRows, nextSource = 'demo' }: GameGridProps) {
  const hasRound = rows !== null
  const displayRows = [...(rows ?? placeholderRows())].reverse()
  const activeRow = phase === 'revealing' ? revealedRows : -1
  return <section aria-label="شبكة اللعبة" className="panel relative p-2.5 sm:p-5"><div className="mb-3 flex items-center justify-between px-0.5 text-[10px] font-bold text-slate-600 sm:px-1"><span>المضاعف</span><span>5 مواضع في كل صف</span></div><div className="space-y-1.5 sm:space-y-2.5">{displayRows.map((row) => { const revealed = hasRound && row.row <= revealedRows; return <div key={row.row} className="flex items-center gap-1.5 sm:gap-3"><MultiplierRung multiplier={row.multiplier} revealed={revealed} active={row.row === activeRow} /><div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5 sm:gap-2.5">{row.cells.map((cell) => { const state: CellState = !hasRound ? 'empty' : revealed ? cell.value === '1' ? 'safe' : 'bomb' : 'hidden'; return <AppleCell key={cell.key} state={state} label={hasRound ? `الموضع ${cell.key}` : null} animate={phase === 'revealing' || phase === 'revealed'} /> })}</div></div> })}</div>{phase === 'idle' && !hasRound && <div className="absolute inset-2.5 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#080d0f]/80 p-5 text-center backdrop-blur-[2px] sm:inset-5 sm:rounded-2xl"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[.08] text-emerald-300"><Apple className="h-5 w-5" /></span><p className="max-w-xs text-sm font-semibold text-slate-300">{nextSource === 'live' ? <>حمّل <span className="text-emerald-200">الجولة المباشرة الحالية</span> لفحصها.</> : <>أنشئ <span className="text-cyan-200">جولة جديدة</span> لملء الشبكة.</>}</p><p className="max-w-sm text-xs leading-5 text-slate-600">كل جولة بيتم التحقق منها قبل العرض. الجسر المباشر بيحافظ على عقده الـ 50 الحالية.</p></div>}</section>
}

function placeholderRows(): RowView[] { return ROWS.map((spec) => ({ row: spec.row, multiplier: spec.multiplier, cells: Array.from({ length: 5 }, (_, index) => ({ key: spec.keys[index], value: '0' as const })) })).slice(0, GRID_ROWS) }

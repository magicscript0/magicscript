import { memo } from 'react'
import { Apple, Bomb } from 'lucide-react'
import { GRID_ROWS, ROWS } from '../config/game'
import type { RoundPhase, RoundSource, RowView } from '../types/game'
import { MultiplierRung } from './MultiplierLadder'

type CellState = 'empty' | 'hidden' | 'safe' | 'bomb'

const CELL_CLASSES: Record<CellState, string> = {
  empty: 'border-dashed border-slate-800 bg-slate-900/30 text-slate-700',
  hidden: 'border-slate-700 bg-slate-800/80 text-slate-500 shadow-cell',
  safe: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300 shadow-glow-safe',
  bomb: 'border-rose-400/70 bg-rose-500/15 text-rose-300 shadow-glow-danger',
}

const CELL_LABELS: Record<CellState, string> = {
  empty: 'empty',
  hidden: 'hidden',
  safe: 'safe',
  bomb: 'bomb',
}

interface AppleCellProps {
  state: CellState
  label: string | null
  animate: boolean
}

const AppleCell = memo(function AppleCell({ state, label, animate }: AppleCellProps) {
  const animateClass =
    animate && (state === 'safe' || state === 'bomb') ? 'animate-pop-in' : ''
  return (
    <div
      role={label === null ? undefined : 'img'}
      aria-label={label === null ? undefined : `${label} — ${CELL_LABELS[state]}`}
      aria-hidden={label === null ? true : undefined}
      className={`flex aspect-square min-h-[44px] w-full items-center justify-center rounded-xl border transition-colors duration-200 ${CELL_CLASSES[state]} ${animateClass}`}
    >
      {state === 'bomb' ? (
        <Bomb aria-hidden="true" className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.2} />
      ) : (
        <Apple
          aria-hidden="true"
          className={`h-6 w-6 sm:h-7 sm:w-7 ${state === 'hidden' || state === 'empty' ? 'opacity-40' : ''}`}
          strokeWidth={2.2}
        />
      )}
    </div>
  )
})

export interface GameGridProps {
  /** Current round rows (null before the first START). */
  rows: readonly RowView[] | null
  phase: RoundPhase
  /** How many rows (from row 1 upward) have been revealed. */
  revealedRows: number
  /** What START will load next — used only for the idle hint text. */
  nextSource?: RoundSource
}

/**
 * The 10×5 apple grid. Row 10 (×349.68) is displayed at the top and
 * row 1 (×1.23) at the bottom — the same orientation as the original app.
 * The grid is a display surface (not interactive), exactly like the
 * original operator console.
 */
export function GameGrid({ rows, phase, revealedRows, nextSource = 'demo' }: GameGridProps) {
  const hasRound = rows !== null
  // Display top row first (row 10 → row 1).
  const displayRows = [...(rows ?? placeholderRows())].reverse()
  const activeRow = phase === 'revealing' ? revealedRows : -1

  return (
    <section
      aria-label="Apple grid"
      className="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-3 sm:p-5"
    >
      <div className="space-y-1.5 sm:space-y-2.5">
        {displayRows.map((row) => {
          const rowNumber = row.row
          const revealed = hasRound && rowNumber <= revealedRows
          return (
            <div key={rowNumber} className="flex items-center gap-2 sm:gap-3">
              <MultiplierRung
                multiplier={row.multiplier}
                revealed={revealed}
                active={rowNumber === activeRow}
              />
              <div className="grid flex-1 grid-cols-5 gap-1.5 sm:gap-2.5">
                {row.cells.map((cell) => {
                  const state: CellState = !hasRound
                    ? 'empty'
                    : revealed
                      ? cell.value === '1'
                        ? 'safe'
                        : 'bomb'
                      : 'hidden'
                  return (
                    <AppleCell
                      key={cell.key}
                      state={state}
                      label={hasRound ? `Position ${cell.key}` : null}
                      animate={phase === 'revealing' || phase === 'revealed'}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state overlay — grid stays rendered so layout never shifts */}
      {phase === 'idle' && !hasRound && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-slate-950/70 p-6 text-center backdrop-blur-[2px]">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="h-12 w-12 opacity-70">
            <path
              d="M32 16c-2-4-7-5-9-4 0 3 3 6 7 6-6 1-11 6-11 14 0 10 6 18 12 18 3 0 4-1 6-1s3 1 6 1c6 0 12-8 12-18 0-10-8-15-13-14-3 .6-7-3-10-2z"
              fill="#34d399"
              opacity="0.5"
            />
          </svg>
          <p className="max-w-xs text-sm font-medium text-slate-300">
            {nextSource === 'live' ? (
              <>
                Press <span className="font-bold text-emerald-300">LOAD LIVE ROUND</span> to
                mirror the current /m11 round.
              </>
            ) : (
              <>
                Press <span className="font-bold text-cyan-300">NEW DEMO ROUND</span> to
                generate a local demo round.
              </>
            )}
          </p>
          <p className="max-w-xs text-xs text-slate-500">
            {nextSource === 'live'
              ? 'The grid will mirror exactly what the Android demo client reads from Firebase — or start a NEW GAME to publish a fresh round (APP 2 receives it automatically).'
              : 'Nothing is written anywhere — results stay in this browser (offline demo mode).'}
          </p>
        </div>
      )}
    </section>
  )
}

/** Placeholder rows keep the grid's shape before the first round exists. */
function placeholderRows(): RowView[] {
  return ROWS.map((spec) => ({
    row: spec.row,
    multiplier: spec.multiplier,
    cells: Array.from({ length: 5 }, (_, index) => ({
      key: spec.keys[index],
      value: '0' as const,
    })),
  })).slice(0, GRID_ROWS)
}

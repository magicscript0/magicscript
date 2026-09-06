import { memo } from 'react'
import { Apple, Bomb } from 'lucide-react'
import { GRID_ROWS, ROWS, formatMultiplier } from '../config/game'
import type { M11Value, RoundPhase, RowView } from '../types/game'

type CellState = 'empty' | 'hidden' | 'safe' | 'bomb'

const CELL_MODIFIERS: Record<CellState, string> = {
  empty: 'fortune-cell--empty',
  hidden: '',
  safe: 'fortune-cell--safe',
  bomb: 'fortune-cell--bomb',
}

const STATE_LABELS: Record<CellState, string> = {
  empty: 'empty',
  hidden: 'hidden',
  safe: 'safe',
  bomb: 'bomb',
}

const VALUE_TO_VISUAL: Readonly<Record<M11Value, 'safe' | 'bomb'>> = {
  '1': 'safe', // Firebase WIN / SAFE apple
  '0': 'bomb', // Firebase LOSE / BROKEN apple
}

/**
 * Visual mapping for the public prediction board.
 *
 * Values arrive exactly as stored in Firebase /m11 (m1…m50) and keep the
 * existing contract semantics unchanged. This function only assigns the
 * logical result state:
 *
 *   stored "1" → SAFE state
 *   stored "0" → BROKEN state
 *
 * The rendered apple assets are swapped inside FortuneCell so the public
 * experience shows the SAFE/GOOD apple visual for safe data and the
 * BROKEN/BOMB-looking apple visual for broken data. This is visual-only;
 * no stored value or Firebase contract is changed.
 */
export function boardVisualForValue(value: M11Value): 'safe' | 'bomb' {
  return VALUE_TO_VISUAL[value]
}

const FortuneCell = memo(function FortuneCell({ state, label, animate }: { state: CellState; label: string | null; animate: boolean }) {
  const animation = animate && (state === 'safe' || state === 'bomb') ? 'animate-pop-in' : ''
  return (
    <div
      role={label === null ? undefined : 'img'}
      aria-label={label === null ? undefined : `${label} — ${STATE_LABELS[state]}`}
      aria-hidden={label === null ? true : undefined}
      className={`fortune-cell ${CELL_MODIFIERS[state]} ${animation}`}
    >
      <span className="flex h-[52%] w-[52%] items-center justify-center">
        {state === 'safe' ? (
          <Bomb aria-hidden="true" className="h-full w-full" strokeWidth={2.2} />
        ) : (
          <Apple aria-hidden="true" className={`h-full w-full ${state === 'hidden' || state === 'empty' ? 'opacity-40' : ''}`} strokeWidth={2.2} />
        )}
      </span>
    </div>
  )
})

export interface FortuneBoardProps {
  rows: readonly RowView[] | null
  phase: RoundPhase
  revealedRows: number
}

/**
 * The Apple of Fortune prediction board.
 *
 * Renders the exact same m1…m50 → row/column mapping as the admin console
 * (same RowView model, same key order), but sizes itself to fill the stage
 * it is given — every row stays visible inside the mobile viewport without
 * scrolling (see the .fortune-* rules in index.css).
 */
export function FortuneBoard({ rows, phase, revealedRows }: FortuneBoardProps) {
  const hasRound = rows !== null
  const displayRows = [...(rows ?? placeholderRows())].reverse()
  const activeRow = phase === 'revealing' ? revealedRows : -1

  return (
    <section aria-label="Prediction board" className="fortune-board">
      {displayRows.map((row) => {
        const revealed = hasRound && row.row <= revealedRows
        return (
          <div key={row.row} className="contents">
            <div className={`fortune-chip ${row.row === activeRow ? 'fortune-chip--active' : ''}`}>{formatMultiplier(row.multiplier)}</div>
            {row.cells.map((cell) => {
              const state: CellState = !hasRound ? 'empty' : revealed ? boardVisualForValue(cell.value) : 'hidden'
              return <FortuneCell key={cell.key} state={state} label={hasRound ? `Position ${cell.key}` : null} animate={phase === 'revealing' || phase === 'revealed'} />
            })}
          </div>
        )
      })}
    </section>
  )
}

function placeholderRows(): RowView[] {
  return ROWS.map((spec) => ({
    row: spec.row,
    multiplier: spec.multiplier,
    cells: Array.from({ length: 5 }, (_, index) => ({ key: spec.keys[index], value: '0' as const })),
  })).slice(0, GRID_ROWS)
}

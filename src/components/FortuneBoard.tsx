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

/**
 * FRONTEND-ONLY visual mapping for the public prediction board.
 *
 * Nothing about the backend changes here: values arrive exactly as stored
 * (/m11 m1…m50), and the generator, validation, live mirror, and safe-cell
 * counts all keep their existing meaning — no value is rewritten, invented,
 * or reinterpreted upstream. This function only decides which of the two
 * existing result visuals each stored value renders as once revealed:
 *
 *   stored "1" → trap (spike) visual · stored "0" → apple visual.
 */
export function boardVisualForValue(value: M11Value): 'safe' | 'bomb' {
  return value === '1' ? 'bomb' : 'safe'
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
        {state === 'bomb' ? (
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

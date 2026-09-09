import { memo, type CSSProperties } from 'react'
import { Apple, Bomb } from 'lucide-react'
import { GRID_ROWS, ROWS, formatMultiplier } from '../config/game'
import type { M11Value, RoundPhase, RowView } from '../types/game'

type CellState = 'empty' | 'hidden' | 'safe' | 'bomb'

const CELL_MODIFIERS: Record<CellState, string> = {
  empty: 'fortune-cell--empty',
  hidden: 'fortune-cell--hidden',
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

/**
 * One board position.
 *
 * The accessible contract is untouched: the cell itself is the labelled
 * `img` node and everything inside it is decorative. The inner spans exist
 * only so lighting can be layered — a recessed well, the glyph on its own
 * contact shadow, and a state rim that flashes once as the row is revealed.
 */
const FortuneCell = memo(function FortuneCell({ state, label, animate, armed = false }: { state: CellState; label: string | null; animate: boolean; armed?: boolean }) {
  const animation = animate && (state === 'safe' || state === 'bomb') ? 'animate-pop-in' : ''
  return (
    <div
      role={label === null ? undefined : 'img'}
      aria-label={label === null ? undefined : `${label} — ${STATE_LABELS[state]}`}
      aria-hidden={label === null ? true : undefined}
      className={`fortune-cell ${CELL_MODIFIERS[state]} ${animation}${armed ? ' fortune-cell--armed' : ''}`}
    >
      <span className="fortune-cell__well" aria-hidden="true" />
      <span className="fortune-cell__glyph" aria-hidden="true">
        {state === 'safe' ? (
          <Bomb className="h-full w-full" strokeWidth={2.2} />
        ) : (
          <Apple className={`h-full w-full${state === 'hidden' || state === 'empty' ? ' is-dim' : ''}`} strokeWidth={2.2} />
        )}
      </span>
    </div>
  )
})

interface FortuneRowProps {
  row: RowView
  hasRound: boolean
  isRevealed: boolean
  armed: boolean
  animate: boolean
}

/**
 * One ladder row: its multiplier chip plus the five cells.
 *
 * Memoized on stable props (the row objects come straight from the round
 * view and never change identity mid-round) so a reveal step only re-renders
 * the row that was just revealed and the row that just became armed — the
 * other eight rows keep their existing DOM, and unrelated cells are never
 * touched.
 */
const FortuneRow = memo(function FortuneRow({ row, hasRound, isRevealed, armed, animate }: FortuneRowProps) {
  return (
    <div className="contents">
      <div className={`fortune-chip${isRevealed ? ' fortune-chip--revealed' : ''}${armed ? ' fortune-chip--active' : ''}`}>
        {formatMultiplier(row.multiplier)}
      </div>
      {row.cells.map((cell) => {
        const state: CellState = !hasRound ? 'empty' : isRevealed ? boardVisualForValue(cell.value) : 'hidden'
        return <FortuneCell key={cell.key} state={state} label={hasRound ? `Position ${cell.key}` : null} animate={animate} armed={armed} />
      })}
    </div>
  )
})

export interface FortuneBoardProps {
  rows: readonly RowView[] | null
  phase: RoundPhase
  revealedRows: number
}

/**
 * The Apple of Fortune prediction board — the hero component of the product.
 *
 * Renders the exact same m1…m50 → row/column mapping as the admin console
 * (same RowView model, same key order, same reveal order), but composes it
 * like a console instrument: a multiplier rail that fills as rows are
 * revealed, a ladder of recessed tile surfaces, and a left-to-right cascade
 * inside each row. Cell size is derived from the stage it is given, so all
 * ten rows stay on screen without scrolling (see the .fortune-* rules in
 * index.css).
 *
 * The board itself is memoized: its props only change when the round, the
 * phase or the revealed-row count actually change, so the per-second access
 * countdown re-renders none of the 50 cells.
 */
export const FortuneBoard = memo(function FortuneBoard({ rows, phase, revealedRows }: FortuneBoardProps) {
  const hasRound = rows !== null
  const displayRows = [...(rows ?? PLACEHOLDER_ROWS)].reverse()
  const activeRow = phase === 'revealing' ? revealedRows : -1
  const revealed = hasRound ? Math.min(GRID_ROWS, Math.max(0, revealedRows)) : 0
  // 0…1 fill of the multiplier rail; .fortune-rail::after scales to it with
  // a compositor transform instead of animating height.
  const railStyle = { '--pg-rail': String(revealed / GRID_ROWS) } as CSSProperties
  const animate = phase === 'revealing' || phase === 'revealed'

  return (
    <section aria-label="Prediction board" className="fortune-board" style={railStyle}>
      {displayRows.map((row) => {
        const isRevealed = hasRound && row.row <= revealedRows
        const armed = row.row === activeRow
        return <FortuneRow key={row.row} row={row} hasRound={hasRound} isRevealed={isRevealed} armed={armed} animate={animate} />
      })}
      <span className="fortune-rail" aria-hidden="true" />
      {/* Mirrors the axis on the right at desktop widths so the ladder reads as
          an instrument, not a left-aligned table. Decorative only. */}
      <span className="fortune-axis" aria-hidden="true" />
    </section>
  )
})

/**
 * Placeholder ladder shown before any round exists. Module-level so the idle
 * board keeps stable row identity across renders (its rows memoize away).
 */
const PLACEHOLDER_ROWS: RowView[] = ROWS.map((spec) => ({
  row: spec.row,
  multiplier: spec.multiplier,
  cells: Array.from({ length: 5 }, (_, index) => ({ key: spec.keys[index], value: '0' as const })),
})).slice(0, GRID_ROWS)

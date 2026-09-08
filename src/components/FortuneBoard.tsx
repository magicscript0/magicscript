import { memo, useMemo, type CSSProperties } from 'react'
import { Apple, Bomb } from 'lucide-react'
import { GRID_COLS, GRID_ROWS, ROWS, formatMultiplier } from '../config/game'
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
const FortuneCell = memo(function FortuneCell({ state, label, armed = false }: { state: CellState; label: string | null; armed?: boolean }) {
  /* The pop belongs to *being resolved*: a tile animates when it turns into an
   * apple/broken glyph, and only then. Deriving it from the tile's own state
   * instead of a phase-driven `animate` prop means pressing Reveal changes no
   * cell prop at all — the 50 hidden tiles do not re-render for that click, and
   * each step re-renders only the row it resolves plus the row it arms. */
  const animation = state === 'safe' || state === 'bomb' ? 'animate-pop-in' : ''
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

export interface FortuneBoardProps {
  rows: readonly RowView[] | null
  phase: RoundPhase
  revealedRows: number
}

/**
 * Placeholder ladder shown before a round exists. Built once: it is rendered on
 * every pre-round frame, and allocating 50 cell objects per render only to
 * throw them away is exactly the kind of noise the board should not have.
 */
const PLACEHOLDER_ROWS: readonly RowView[] = ROWS.map((spec) => ({
  row: spec.row,
  multiplier: spec.multiplier,
  cells: Array.from({ length: GRID_COLS }, (_, index) => ({ key: spec.keys[index], value: '0' as const })),
})).slice(0, GRID_ROWS)

/** The ladder is displayed top-down (row 10 first), so the order is fixed too. */
const PLACEHOLDER_DISPLAY_ROWS: readonly RowView[] = [...PLACEHOLDER_ROWS].reverse()

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
 * Memoized on purpose: the board sits next to an access countdown that ticks
 * once per second and a Firebase mirror that can update at any moment. With
 * `rows` / `phase` / `revealedRows` unchanged, none of that may reach the fifty
 * cells — and because every cell is itself memoized on primitive props, one
 * revealed row re-renders five tiles instead of the whole ladder.
 */
export const FortuneBoard = memo(function FortuneBoard({ rows, phase, revealedRows }: FortuneBoardProps) {
  const hasRound = rows !== null
  const displayRows = useMemo(
    () => (rows === null ? PLACEHOLDER_DISPLAY_ROWS : [...rows].reverse()),
    [rows],
  )
  const activeRow = phase === 'revealing' ? revealedRows : -1
  const revealed = hasRound ? Math.min(GRID_ROWS, Math.max(0, revealedRows)) : 0
  /* Unitless 0–1 fraction: the rail fills with a composited scaleY, so an
     animated height never runs a layout pass mid-reveal. */
  const railStyle = { '--pg-rail': (revealed / GRID_ROWS).toFixed(3) } as CSSProperties

  return (
    <section aria-label="Prediction board" className="fortune-board" style={railStyle}>
      {displayRows.map((row) => {
        const isRevealed = hasRound && row.row <= revealedRows
        const armed = row.row === activeRow
        return (
          <div key={row.row} className="contents">
            <div className={`fortune-chip${isRevealed ? ' fortune-chip--revealed' : ''}${armed ? ' fortune-chip--active' : ''}`}>
              {formatMultiplier(row.multiplier)}
            </div>
            {row.cells.map((cell) => {
              const state: CellState = !hasRound ? 'empty' : isRevealed ? boardVisualForValue(cell.value) : 'hidden'
              return <FortuneCell key={cell.key} state={state} label={hasRound ? `Position ${cell.key}` : null} armed={armed} />
            })}
          </div>
        )
      })}
      <span className="fortune-rail" aria-hidden="true" />
      {/* Mirrors the axis on the right at desktop widths so the ladder reads as
          an instrument, not a left-aligned table. Decorative only. */}
      <span className="fortune-axis" aria-hidden="true" />
    </section>
  )
})

import React, { memo } from 'react'
import { Apple, Bomb, Lock } from 'lucide-react'
import { GRID_ROWS, ROWS, formatMultiplier } from '../config/game'
import type { M11Value, RoundPhase, RowView } from '../types/game'

type CellState = 'empty' | 'hidden' | 'safe' | 'bomb'

const VALUE_TO_VISUAL: Readonly<Record<M11Value, 'safe' | 'bomb'>> = {
  '1': 'safe', // SAFE apple
  '0': 'bomb', // BROKEN apple / bomb
}

export function boardVisualForValue(value: M11Value): 'safe' | 'bomb' {
  return VALUE_TO_VISUAL[value]
}

const FortuneCell = memo(function FortuneCell({
  state,
  label,
  armed = false,
}: {
  state: CellState
  label: string | null
  armed?: boolean
}) {
  return (
    <div
      role={label === null ? undefined : 'img'}
      aria-label={label === null ? undefined : label}
      className={`relative flex items-center justify-center rounded-xl transition-all duration-300 h-11 sm:h-12 border ${
        state === 'safe'
          ? 'bg-emerald-500/25 border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.5)] scale-[1.02]'
          : state === 'bomb'
          ? 'bg-rose-500/25 border-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
          : armed
          ? 'bg-cyan-500/15 border-cyan-400/80 shadow-[0_0_12px_rgba(0,242,254,0.3)] animate-pulse'
          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {state === 'safe' ? (
        <div className="flex items-center justify-center text-emerald-300">
          <Apple className="h-6 w-6 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-bounce" />
        </div>
      ) : state === 'bomb' ? (
        <div className="flex items-center justify-center text-rose-400">
          <Bomb className="h-6 w-6 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
        </div>
      ) : state === 'hidden' ? (
        <div className="flex items-center justify-center text-slate-600">
          <Lock className="h-4 w-4 opacity-40" />
        </div>
      ) : (
        <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
      )}
    </div>
  )
})

export interface FortuneBoardProps {
  rows: readonly RowView[] | null
  phase: RoundPhase
  revealedRows: number
}

export function FortuneBoard({ rows, phase, revealedRows }: FortuneBoardProps) {
  const hasRound = rows !== null
  const displayRows = [...(rows ?? placeholderRows())].reverse()
  const activeRow = phase === 'revealing' ? revealedRows : -1

  return (
    <div className="w-full flex flex-col gap-2 p-3 sm:p-5 rounded-3xl glass-panel-elevated border border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
      {displayRows.map((row) => {
        const isRevealed = hasRound && row.row <= revealedRows
        const armed = row.row === activeRow

        return (
          <div
            key={row.row}
            className={`flex items-center gap-2.5 p-1 rounded-2xl transition-all ${
              armed
                ? 'bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,242,254,0.2)]'
                : ''
            }`}
          >
            {/* Multiplier Chip */}
            <div
              className={`w-16 sm:w-20 py-2.5 px-2 rounded-xl text-center font-mono-tech text-xs font-bold transition-all ${
                isRevealed
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/80 shadow-[0_0_12px_rgba(0,242,254,0.3)]'
                  : armed
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
                  : 'bg-slate-900/60 text-slate-500 border border-slate-800'
              }`}
            >
              {formatMultiplier(row.multiplier)}
            </div>

            {/* 5 Column Tiles */}
            <div className="grid grid-cols-5 gap-2 flex-1">
              {row.cells.map((cell) => {
                const state: CellState = !hasRound
                  ? 'empty'
                  : isRevealed
                  ? boardVisualForValue(cell.value)
                  : 'hidden'
                return (
                  <FortuneCell
                    key={cell.key}
                    state={state}
                    label={hasRound ? `Position ${cell.key}` : null}
                    armed={armed}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

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

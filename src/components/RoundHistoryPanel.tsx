import { History, ListOrdered } from 'lucide-react'
import { ROWS } from '../config/game'
import { normalizePickColIndex, type LiveGameState } from '../types/labx'

export interface RoundHistoryPanelProps {
  game: LiveGameState
}

export function RoundHistoryPanel({ game }: RoundHistoryPanelProps) {
  const userPicks = game.user_picks
  const matrix = game.matrix
  const betSum = game.bet_sum ?? 10
  const hasHistory = userPicks.length > 0

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[.08] bg-slate-950/80 p-3.5 sm:p-5 backdrop-blur-xl shadow-2xl">
      {/* Header with Title and Sleek Steps Pill Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[.06] pb-3.5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Round-by-Round Breakdown / سجل الجولات خطوة بخطوة
          </h3>
        </div>
        <div
          dir="ltr"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold shadow-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{userPicks.length} {userPicks.length === 1 ? 'Step' : 'Steps'} Played</span>
        </div>
      </div>

      {!hasHistory ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/60 shadow-inner">
            <div className="absolute inset-0 rounded-2xl border border-cyan-500/20 animate-pulse" />
            <ListOrdered className="h-6 w-6 text-slate-500" />
          </div>
          <p className="text-xs font-semibold text-slate-300 font-mono-tech">
            No picks played in the active session yet.
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono-tech">
            Picks, safe paths, and multipliers will stream here in real time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {userPicks.map((rawPick, rowIndex) => {
            const pickedColIdx = normalizePickColIndex(rawPick)
            const displayColNumber = pickedColIdx !== null ? pickedColIdx + 1 : '-'
            const rowSpec = ROWS[rowIndex]
            const multiplier = rowSpec ? rowSpec.multiplier : 1.0
            const isSafe =
              matrix && matrix[rowIndex] && pickedColIdx !== null
                ? matrix[rowIndex][pickedColIdx] === 1
                : true
            const stepWin = Number((betSum * multiplier).toFixed(2))

            return (
              <div
                key={rowIndex}
                className={`flex flex-col justify-between rounded-xl border p-3 sm:p-3.5 transition-all ${
                  isSafe
                    ? 'border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                    : 'border-rose-500/30 bg-rose-950/20 shadow-[0_0_12px_rgba(244,63,94,0.12)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 font-mono-tech">
                    Row {rowIndex + 1}
                  </span>
                  <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300 border border-white/[.06]">
                    ×{multiplier.toFixed(2)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    العمود / Col: <span className="font-mono font-bold text-slate-100">#{displayColNumber}</span>
                  </span>
                  {isSafe ? (
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                      <img
                        src="/images/apple-safe.webp"
                        alt="WIN"
                        onError={(e) => { e.currentTarget.src = '/images/apple-safe.png' }}
                        className="h-5 w-5 object-contain drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                      /> WIN
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 font-semibold text-rose-400">
                      <img
                        src="/images/apple-broken.webp"
                        alt="BUST"
                        onError={(e) => { e.currentTarget.src = '/images/apple-broken.png' }}
                        className="h-5 w-5 object-contain drop-shadow-[0_0_6px_rgba(244,63,94,0.4)]"
                      /> BUST
                    </span>
                  )}
                </div>

                <div dir="ltr" className="mt-2.5 border-t border-white/[.06] pt-1.5 flex items-center justify-between font-mono text-xs font-semibold">
                  <span className="text-slate-400 text-[10px]">المكسب / Payout:</span>
                  <span className={isSafe ? 'text-emerald-400' : 'text-slate-500'}>
                    {isSafe ? `+${stepWin.toFixed(2)} EGP` : '0.00 EGP'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

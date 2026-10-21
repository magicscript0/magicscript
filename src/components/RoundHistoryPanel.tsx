import { CheckCircle2, History, ListOrdered, Navigation, XCircle } from 'lucide-react'
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
    <div className="cockpit-panel relative flex flex-col gap-3 overflow-hidden rounded-3xl p-5 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[.08] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-black tracking-widest uppercase text-slate-100">
              Tactical Flight Log / سجل الجولات خطوة بخطوة
            </h3>
            <p className="text-[10px] font-medium text-slate-400">
              توثيق زمني لتحركاتك والمضاعفات المحققة في كل صف
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-[11px] font-bold text-slate-300">
            {userPicks.length} {userPicks.length === 1 ? 'Step' : 'Steps'} Recorded
          </span>
        </div>
      </div>

      {!hasHistory ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[.02] text-slate-600">
            <ListOrdered className="h-6 w-6" />
          </div>
          <p className="mt-3 text-xs font-bold text-slate-300">
            No flight picks recorded in the active session yet
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            كل اختيار يتم في اللعبة يوثق هنا تلقائياً بالمضاعف ومكان التفاحة
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
                className={`cockpit-card group relative flex flex-col justify-between overflow-hidden rounded-2xl p-3.5 transition-all duration-300 hover:scale-[1.02] ${
                  isSafe
                    ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-950/30 via-slate-950/80 to-black/60 shadow-[0_4px_20px_rgba(16,185,129,0.15)] hover:border-emerald-400'
                    : 'border-rose-500/40 bg-gradient-to-b from-rose-950/30 via-slate-950/80 to-black/60 shadow-[0_4px_20px_rgba(244,63,94,0.15)] hover:border-rose-400'
                }`}
              >
                {/* Step badge & Multiplier */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <Navigation className="h-3 w-3 text-cyan-400" />
                    <span>L{rowIndex + 1} • ROW {rowIndex + 1}</span>
                  </span>
                  <span className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-xs font-black text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                    ×{multiplier.toFixed(2)}
                  </span>
                </div>

                {/* Main Outcome & Visual */}
                <div className="my-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={isSafe ? '/images/apple-safe.png' : '/images/apple-broken.png'}
                      alt={isSafe ? 'Safe Apple' : 'Broken Apple'}
                      className="h-8 w-8 object-contain drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                    />
                    <div>
                      <div className="flex items-center gap-1 text-xs font-black tracking-wide">
                        {isSafe ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> WIN
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-rose-400">
                            <XCircle className="h-3.5 w-3.5" /> BUST
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        Col #{displayColNumber}
                      </div>
                    </div>
                  </div>

                  {/* 5-dot Column Locator */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[9px] font-mono text-slate-500">Pick Pos</div>
                    <div className="flex items-center gap-1 rounded bg-black/50 p-1">
                      {[0, 1, 2, 3, 4].map((col) => (
                        <span
                          key={col}
                          className={`h-2 w-2 rounded-full transition-all ${
                            pickedColIdx === col
                              ? isSafe
                                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] scale-125'
                                : 'bg-rose-400 shadow-[0_0_6px_#f43f5e] scale-125'
                              : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Winnings Footer */}
                <div className="flex items-center justify-between border-t border-white/[.06] pt-2 text-xs font-mono">
                  <span className="text-[10px] text-slate-500">Payout:</span>
                  <span className={`font-black ${isSafe ? 'text-emerald-300' : 'text-slate-500'}`}>
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

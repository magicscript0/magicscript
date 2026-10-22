import { useEffect, useRef, useState } from 'react'
import { History, RefreshCw, Sparkles, Target, Trophy, XCircle } from 'lucide-react'
import { ROWS, formatMultiplier } from '../config/game'
import { LiveStatsPanel } from './LiveStatsPanel'
import { RoundHistoryPanel } from './RoundHistoryPanel'
import { useSessions } from '../hooks/useSessions'
import { publishLabxRound } from '../services/labx'
import { normalizePickColIndex, type LiveGameState, type BalanceState } from '../types/labx'

export interface ViewerPanelProps {
  game: LiveGameState
  balanceState: BalanceState
}

export interface EndedGameSummary {
  sessionId: number
  outcome: 'WON' | 'LOST'
  startingBalance: number
  finalBalance: number
  netProfit: number
  finalRound: number
  multiplier: number
  endedAt: number
}

export function ViewerPanel({ game, balanceState }: ViewerPanelProps) {
  const matrix = game.matrix
  const userPicks = game.user_picks
  const currentRow = game.current_row
  const recommendedCols = game.recommended_next?.cols ?? []
  const hasGame = game.active && matrix !== null

  const sessionsState = useSessions(game.account_id ?? undefined)

  // Staggered Entrance Animation State
  const prevSessionIdRef = useRef<number | null>(null)
  const prevActiveRef = useRef<boolean>(false)
  const [isNewGameEntrance, setIsNewGameEntrance] = useState(false)

  // End of Game State
  const [endedSummary, setEndedSummary] = useState<EndedGameSummary | null>(null)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [lastGame, setLastGame] = useState<EndedGameSummary | null>(null)
  const [isStartingGame, setIsStartingGame] = useState(false)

  // Snapshot ref of active game to reconstruct if game ends abruptly
  const activeSnapshotRef = useRef<{
    sessionId: number | null
    betSum: number | null
    winSum: number | null
    userPicks: number[]
    currentRow: number
  }>({
    sessionId: null,
    betSum: null,
    winSum: null,
    userPicks: [],
    currentRow: 0,
  })

  // Detect New Game Entrance Animation
  useEffect(() => {
    const isNew =
      (!prevActiveRef.current && game.active) ||
      (game.session_id !== null && game.session_id !== prevSessionIdRef.current)

    if (isNew && game.active) {
      prevSessionIdRef.current = game.session_id
      setShowEndSummary(false)
      setIsNewGameEntrance(true)
      const timer = window.setTimeout(() => {
        setIsNewGameEntrance(false)
      }, 1000)
      return () => window.clearTimeout(timer)
    }

    if (!game.active) {
      prevSessionIdRef.current = null
    }
  }, [game.active, game.session_id])

  // Cache active snapshot
  useEffect(() => {
    if (game.active) {
      activeSnapshotRef.current = {
        sessionId: game.session_id,
        betSum: game.bet_sum,
        winSum: game.win_sum,
        userPicks: [...game.user_picks],
        currentRow: game.current_row,
      }
    }
  }, [game.active, game.session_id, game.bet_sum, game.win_sum, game.user_picks, game.current_row])

  // Detect End-of-Game Transition (active: true -> active: false)
  useEffect(() => {
    if (prevActiveRef.current && !game.active) {
      // Game just ended -> refresh sessions and balance
      sessionsState.refetch()
      balanceState.refetch()

      const snap = activeSnapshotRef.current
      const currentBal = balanceState.balance ?? 0
      const bet = snap.betSum ?? 10
      const finalRound = snap.userPicks.length
      const mult = finalRound > 0 ? ROWS[Math.min(finalRound - 1, ROWS.length - 1)].multiplier : 1.0

      // Guess outcome: if winSum > 0, it was won, otherwise lost
      const wasWin = (snap.winSum ?? 0) > 0
      const netProfit = wasWin ? (snap.winSum ?? 0) - bet : -bet
      const startingBal = currentBal - netProfit

      const summary: EndedGameSummary = {
        sessionId: snap.sessionId ?? (Date.now() % 10000),
        outcome: wasWin ? 'WON' : 'LOST',
        startingBalance: Number(startingBal.toFixed(2)),
        finalBalance: Number(currentBal.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        finalRound,
        multiplier: mult,
        endedAt: Date.now(),
      }

      setEndedSummary(summary)
      setShowEndSummary(true)
      setLastGame(summary)
    }

    prevActiveRef.current = game.active
  }, [game.active, balanceState, sessionsState])

  // Sync latest completed session if available
  useEffect(() => {
    if (!game.active && sessionsState.sessions.length > 0) {
      const latest = sessionsState.sessions[0]
      const wasWin = latest.status === 2
      const bet = latest.bet_sum
      const win = latest.win_sum
      const netProfit = wasWin ? win - bet : -bet
      const currentBal = balanceState.balance ?? 0
      const startingBal = wasWin ? currentBal - netProfit : currentBal + bet
      const finalRound = latest.user_picks ? latest.user_picks.length : latest.action_step
      const mult = finalRound > 0 ? ROWS[Math.min(finalRound - 1, ROWS.length - 1)].multiplier : 1.0

      const summaryFromSession: EndedGameSummary = {
        sessionId: latest.id,
        outcome: wasWin ? 'WON' : 'LOST',
        startingBalance: Number(startingBal.toFixed(2)),
        finalBalance: Number(currentBal.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        finalRound,
        multiplier: mult,
        endedAt: latest.updated_at || Date.now(),
      }

      if (!lastGame) {
        setLastGame(summaryFromSession)
      }

      // If summary is currently showing, enrich with exact session data
      if (showEndSummary && endedSummary && endedSummary.sessionId === latest.id) {
        setEndedSummary(summaryFromSession)
      }
    }
  }, [game.active, sessionsState.sessions, balanceState.balance, lastGame, showEndSummary, endedSummary])

  const handleRefreshAll = () => {
    game.refetch()
    balanceState.refetch()
    sessionsState.refetch()
  }

  const handleNewRound = () => {
    setShowEndSummary(false)
  }

  const handleStartLiveRound = async () => {
    if (isStartingGame) return
    setIsStartingGame(true)
    try {
      await publishLabxRound({} as any)
      window.setTimeout(() => {
        game.refetch()
        balanceState.refetch()
        sessionsState.refetch()
      }, 400)
    } catch (err) {
      console.warn('[ViewerPanel] Start live round error:', err)
    } finally {
      setIsStartingGame(false)
    }
  }

  // Generate 10 rows descending from 10 to 1
  const rowsToDisplay = [...ROWS].reverse()

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Top action bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-slate-900/50 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex h-2 w-2 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                game.active ? 'bg-emerald-400' : 'bg-slate-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                game.active ? 'bg-emerald-500' : 'bg-slate-500'
              }`}
            />
          </span>
          <span className="font-semibold text-slate-300">
            {game.active ? 'Live Telemetry Connected' : 'Waiting for Active Game'}
          </span>
          {game.account_id && (
            <span className="ml-2 rounded bg-white/[.05] px-2 py-0.5 font-mono text-slate-400">
              Account: #{game.account_id}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={game.loading || balanceState.loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:bg-white/[.08] hover:text-white"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-cyan-400 ${
              game.loading || balanceState.loading ? 'animate-spin' : ''
            }`}
          />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Main split: 10x5 Grid (Left) + LiveStats (Right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* 10x5 Grid Card / End of Game Card */}
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[.08] bg-slate-950/80 p-4.5 backdrop-blur-xl shadow-2xl lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[.06] pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Live 10×5 Matrix Telemetry
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <img src="/images/apple-safe.png" alt="" className="h-4 w-4 object-contain" /> Safe Apple
              </span>
              <span className="flex items-center gap-1.5">
                <img src="/images/apple-broken.png" alt="" className="h-4 w-4 object-contain" /> Broken
              </span>
            </div>
          </div>

          {!hasGame ? (
            showEndSummary && endedSummary ? (
              /* End of Game WIN / LOST Screen */
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/[.1] bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-6 text-center backdrop-blur-2xl shadow-2xl">
                <div
                  className={`mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border ${
                    endedSummary.outcome === 'WON'
                      ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.25)]'
                      : 'border-rose-500/40 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.25)]'
                  }`}
                >
                  <img
                    src={endedSummary.outcome === 'WON' ? '/images/apple-safe.png' : '/images/apple-broken.png'}
                    alt={endedSummary.outcome}
                    className="h-10 w-10 object-contain"
                  />
                </div>

                <h3
                  className={`text-xl font-black tracking-wide ${
                    endedSummary.outcome === 'WON' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {endedSummary.outcome === 'WON' ? '🎉 GAME WON' : '💀 GAME LOST'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">Session #{endedSummary.sessionId} completed</p>

                <div className="mt-5 w-full max-w-sm rounded-xl border border-white/[.06] bg-black/40 p-4 text-xs font-medium">
                  <div className="flex justify-between py-1.5 border-b border-white/[.04]">
                    <span className="text-slate-400">Starting Balance:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {endedSummary.startingBalance.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/[.04]">
                    <span className="text-slate-400">Final Balance:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {endedSummary.finalBalance.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/[.04]">
                    <span className="text-slate-400">
                      {endedSummary.outcome === 'WON' ? 'Net Profit:' : 'Net Loss:'}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        endedSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {endedSummary.netProfit >= 0 ? '+' : ''}
                      {endedSummary.netProfit.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/[.04]">
                    <span className="text-slate-400">
                      {endedSummary.outcome === 'WON' ? 'Final Round:' : 'Last Round:'}
                    </span>
                    <span className="font-mono font-bold text-cyan-300">
                      {endedSummary.finalRound} / 10
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Multiplier:</span>
                    <span className="font-mono font-bold text-cyan-300">
                      x{endedSummary.multiplier.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNewRound}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:brightness-110 active:scale-95"
                >
                  <span>🎮 New Round</span>
                </button>
              </div>
            ) : (
              /* Default Waiting State (Preserved exactly) */
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[.08] bg-black/20 p-8 text-center">
                <Sparkles className="mb-3 h-10 w-10 text-cyan-400/50 animate-pulse" />
                <h4 className="text-sm font-bold text-slate-200">Waiting for game to start…</h4>
                <p className="mt-1 max-w-xs text-xs text-slate-400">
                  Start a round in your app or trigger a new game. Live grid cells and picks will stream here automatically.
                </p>
                <button
                  type="button"
                  disabled={isStartingGame}
                  onClick={() => void handleStartLiveRound()}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-[0_0_15px_rgba(0,242,254,0.3)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className={`h-4 w-4 fill-slate-950 ${isStartingGame ? 'animate-spin' : ''}`} />
                  <span>{isStartingGame ? 'Starting Round...' : 'Trigger Live Round'}</span>
                </button>
              </div>
            )
          ) : (
            /* Active 10x5 Grid */
            <div className="flex flex-col gap-1.5 overflow-x-auto py-1">
              {rowsToDisplay.map((spec) => {
                const rowIndex = spec.row - 1 // 0 to 9
                const isCurrent = rowIndex === currentRow
                const rawPick = userPicks[rowIndex]
                const pickedColIdx = normalizePickColIndex(rawPick)
                const rowCells = matrix ? matrix[rowIndex] : [1, 1, 1, 1, 1]

                return (
                  <div
                    key={spec.row}
                    className={`flex items-center gap-2 rounded-xl border p-1.5 transition-all ${
                      isCurrent
                        ? 'border-cyan-500/60 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/40'
                        : rowIndex < currentRow
                          ? 'border-white/[.04] bg-black/20 opacity-85'
                          : 'border-white/[.03] bg-black/10'
                    }`}
                  >
                    {/* Multiplier Badge */}
                    <div
                      className={`flex w-18 items-center justify-center rounded-lg px-2 py-1.5 font-mono text-xs font-bold ${
                        isCurrent
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-white/[.04] text-slate-300'
                      }`}
                    >
                      {formatMultiplier(spec.multiplier)}
                    </div>

                    {/* 5 Cells */}
                    <div className="grid flex-1 grid-cols-5 gap-1.5">
                      {rowCells.map((cellValue, colIndex) => {
                        const isPicked = pickedColIdx === colIndex
                        const isSafe = cellValue === 1
                        const isRecommended = isCurrent && recommendedCols.includes(colIndex)

                        return (
                          <div
                            key={colIndex}
                            style={
                              isNewGameEntrance
                                ? { animationDelay: `${(spec.row - 1) * 80 + colIndex * 15}ms` }
                                : undefined
                            }
                            className={`relative flex h-10 items-center justify-center rounded-lg border text-xs font-medium transition-all ${
                              isNewGameEntrance ? 'animate-cell-entrance' : ''
                            } ${
                              isPicked
                                ? isSafe
                                  ? 'border-emerald-400 bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.4)] ring-2 ring-emerald-400'
                                  : 'border-rose-400 bg-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.4)] ring-2 ring-rose-400'
                                : isRecommended
                                  ? 'border-cyan-400/50 bg-cyan-500/10'
                                  : isSafe
                                    ? 'border-emerald-500/20 bg-emerald-950/20 text-emerald-300'
                                    : 'border-rose-500/20 bg-rose-950/20 text-rose-400'
                            }`}
                          >
                            {/* Icon visual: custom safe or broken apple images */}
                            {isSafe ? (
                              <img
                                src="/images/apple-safe.png"
                                alt="Safe Apple"
                                className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]"
                              />
                            ) : (
                              <img
                                src="/images/apple-broken.png"
                                alt="Broken Apple"
                                className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(244,63,94,0.35)]"
                              />
                            )}

                            {/* Pick tag */}
                            {isPicked && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-white px-1 font-mono text-[9px] font-black text-black shadow">
                                PICK
                              </span>
                            )}

                            {/* Recommended indicator */}
                            {isRecommended && !isPicked && (
                              <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live Stats Panel (Right) - clean reflow without Synchronizer Notes */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <LiveStatsPanel game={game} balanceState={balanceState} />
        </div>
      </div>

      {/* Row 2: Round History Panel */}
      <RoundHistoryPanel game={game} />

      {/* Persistent Last Game Summary Card (Task 4.5) */}
      {lastGame && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/[.06] bg-slate-950/60 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <History className="h-4 w-4 text-cyan-400" /> Last Game Summary:
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                lastGame.outcome === 'WON'
                  ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/20 text-rose-300'
              }`}
            >
              {lastGame.outcome === 'WON' ? (
                <>
                  <Trophy className="h-3.5 w-3.5" /> WON
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" /> LOST
                </>
              )}
            </span>
            <span className="rounded bg-white/[.05] px-2 py-0.5 font-mono text-xs text-slate-300">
              Session #{lastGame.sessionId}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-400">
              Net:{' '}
              <span
                className={`font-bold ${
                  lastGame.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {lastGame.netProfit >= 0 ? '+' : ''}
                {lastGame.netProfit.toFixed(2)} EGP
              </span>
            </span>
            <span className="text-slate-400">
              Rounds: <span className="font-bold text-cyan-300">{lastGame.finalRound}/10</span>
            </span>
            <span className="text-slate-500">
              {new Date(lastGame.endedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

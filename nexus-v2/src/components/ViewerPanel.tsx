import { useEffect, useRef, useState } from 'react'
import {
  History,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Radar,
} from 'lucide-react'
import { ROWS, formatMultiplier } from '../config/game'
import { LiveStatsPanel } from './LiveStatsPanel'
import { RoundHistoryPanel } from './RoundHistoryPanel'
import { useSessions } from '../hooks/useSessions'
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
      sessionsState.refetch()
      balanceState.refetch()

      const snap = activeSnapshotRef.current
      const currentBal = balanceState.balance ?? 0
      const bet = snap.betSum ?? 10
      const finalRound = snap.userPicks.length
      const mult = finalRound > 0 ? ROWS[Math.min(finalRound - 1, ROWS.length - 1)].multiplier : 1.0

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

  // Generate 10 rows descending from 10 to 1
  const rowsToDisplay = [...ROWS].reverse()

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Top action bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-slate-900/50 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs font-mono-tech">
          <span className="flex h-2 w-2 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                game.active ? 'bg-emerald-400' : 'bg-cyan-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                game.active ? 'bg-emerald-500' : 'bg-cyan-500'
              }`}
            />
          </span>
          <span className="font-semibold text-slate-300">
            {game.active ? 'Live Telemetry Connected' : 'Telemetry Synchronizer Standby'}
          </span>
          {game.account_id && (
            <span className="ml-2 rounded bg-white/[.05] px-2 py-0.5 text-slate-400">
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
            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono-tech">
              <span className="flex items-center gap-1.5">
                <img
                  src="/images/apple-safe.webp"
                  alt="Safe Apple"
                  onError={(e) => {
                    e.currentTarget.src = '/images/apple-safe.png'
                  }}
                  className="h-4 w-4 object-contain drop-shadow-[0_0_5px_rgba(52,211,153,0.4)]"
                />{' '}
                Safe Apple
              </span>
              <span className="flex items-center gap-1.5">
                <img
                  src="/images/apple-broken.webp"
                  alt="Rotten Apple"
                  onError={(e) => {
                    e.currentTarget.src = '/images/apple-broken.png'
                  }}
                  className="h-4 w-4 object-contain drop-shadow-[0_0_5px_rgba(244,63,94,0.4)]"
                />{' '}
                Rotten
              </span>
            </div>
          </div>

          {!hasGame ? (
            showEndSummary && endedSummary ? (
              endedSummary.outcome === 'WON' ? (
                /* Custom Win State: Celebratory Emerald & Gold Victory Screen */
                <div className="relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/40 via-slate-950/95 to-slate-950/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.85)] animate-win-glow">
                  {/* Celebratory Ambient Radiance */}
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.22),transparent_60%)]" />

                  {/* Safe Apple in Golden Victory Halo */}
                  <div className="relative mb-3 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-400/20 to-emerald-500/20 shadow-[0_0_35px_rgba(251,191,36,0.4)] animate-pulse" />
                    <div className="absolute -inset-1 rounded-2xl border border-emerald-400/30 animate-orbit-spin" />
                    <img
                      src="/images/apple-safe.webp"
                      alt="Safe Apple"
                      onError={(e) => {
                        e.currentTarget.src = '/images/apple-safe.png'
                      }}
                      className="relative z-10 h-14 w-14 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-transform duration-300 hover:scale-110"
                    />
                    <div className="absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow-md">
                      <Trophy className="h-3.5 w-3.5 fill-current" />
                    </div>
                  </div>

                  {/* Bold Victory Banner */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono-tech tracking-wider uppercase mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>CASHOUT CONFIRMED</span>
                  </div>

                  <h3 className="font-display text-2xl sm:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-amber-200 to-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                    VICTORY ACHIEVED!
                  </h3>
                  <p className="mt-0.5 text-xs font-mono-tech text-slate-400">
                    Round #{endedSummary.sessionId} Completed Successfully
                  </p>

                  {/* Detailed Cyber Breakdown Card */}
                  <div className="mt-5 w-full max-w-sm rounded-xl border border-emerald-500/25 bg-black/50 p-4 text-xs font-mono-tech shadow-inner">
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Starting Balance:</span>
                      <span className="font-bold text-slate-200">
                        {endedSummary.startingBalance.toFixed(2)} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Final Balance:</span>
                      <span className="font-bold text-emerald-400">
                        {endedSummary.finalBalance.toFixed(2)} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Net Profit:</span>
                      <span className="font-extrabold text-emerald-400 glow-cyan">
                        +{endedSummary.netProfit >= 0 ? endedSummary.netProfit.toFixed(2) : '0.00'} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Rounds Cleared:</span>
                      <span className="font-bold text-cyan-300">
                        {endedSummary.finalRound} / 10 ROWS
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-400">Multiplier Locked:</span>
                      <span className="font-extrabold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                        ×{endedSummary.multiplier.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* New Round Launch Button */}
                  <button
                    type="button"
                    onClick={handleNewRound}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-7 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all hover:brightness-110 active:scale-95"
                  >
                    <Sparkles className="h-4 w-4 fill-slate-950" />
                    <span>PREPARE NEXT ROUND</span>
                  </button>
                </div>
              ) : (
                /* Custom Loss State: Dramatic Crimson Glitch & Trap Hit Screen */
                <div className="relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-red-500/40 bg-gradient-to-b from-red-950/40 via-slate-950/95 to-slate-950/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.85)] animate-loss-glow">
                  {/* Dramatic Red Alert Ambience */}
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.22),transparent_60%)]" />

                  {/* Rotten Apple in Hazard Warning Beacon */}
                  <div className="relative mb-3 flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl border-2 border-red-500/60 bg-gradient-to-br from-red-500/20 to-rose-600/20 shadow-[0_0_35px_rgba(239,68,68,0.4)] animate-pulse" />
                    <div className="absolute -inset-1 rounded-2xl border border-red-400/40 animate-orbit-reverse" />
                    <img
                      src="/images/apple-broken.webp"
                      alt="Broken Apple"
                      onError={(e) => {
                        e.currentTarget.src = '/images/apple-broken.png'
                      }}
                      className="relative z-10 h-14 w-14 object-contain drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] transition-transform duration-300 hover:scale-110"
                    />
                    <div className="absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  {/* Sharp Status Banner */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-[11px] font-mono-tech tracking-wider uppercase mb-1">
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    <span>TRAP CELL ENCOUNTERED</span>
                  </div>

                  <h3 className="font-display text-2xl sm:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                    ROUND OVER — TRAP HIT
                  </h3>
                  <p className="mt-0.5 text-xs font-mono-tech text-slate-400">
                    Session #{endedSummary.sessionId} Concluded at Step {endedSummary.finalRound}
                  </p>

                  {/* Cyber Diagnostic Breakdown Card */}
                  <div className="mt-5 w-full max-w-sm rounded-xl border border-red-500/25 bg-black/50 p-4 text-xs font-mono-tech shadow-inner">
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Starting Balance:</span>
                      <span className="font-bold text-slate-200">
                        {endedSummary.startingBalance.toFixed(2)} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Final Balance:</span>
                      <span className="font-bold text-slate-300">
                        {endedSummary.finalBalance.toFixed(2)} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[.06]">
                      <span className="text-slate-400">Round Result:</span>
                      <span className="font-extrabold text-red-400">
                        {endedSummary.netProfit.toFixed(2)} EGP
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-400">Failed at Row:</span>
                      <span className="font-bold text-red-300 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                        ROW {endedSummary.finalRound} OF 10
                      </span>
                    </div>
                  </div>

                  {/* Resync / Next Round Trigger */}
                  <button
                    type="button"
                    onClick={handleNewRound}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 px-7 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all hover:brightness-110 active:scale-95"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>RESYNC & NEXT ROUND</span>
                  </button>
                </div>
              )
            ) : (
              /* Engaging Live Cybernetic Radar & Scanner Synchronizer */
              <div className="relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-slate-950/90 via-[#040816]/95 to-slate-950/95 p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_0_30px_rgba(0,242,254,0.06)]">
                {/* Background Grid Pattern */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage: `radial-gradient(rgba(0, 242, 254, 0.25) 1px, transparent 1px)`,
                    backgroundSize: '24px 24px',
                  }}
                />

                {/* Radar Dish & Scanner Core */}
                <div className="relative mb-6 flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center">
                  {/* Outer Concentric Rings */}
                  <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
                  <div className="absolute inset-4 rounded-full border border-dashed border-cyan-500/30" />
                  <div className="absolute inset-10 rounded-full border border-cyan-500/25" />
                  <div className="absolute inset-16 rounded-full border border-slate-700/40" />

                  {/* Crosshairs */}
                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
                  <div className="absolute inset-y-0 left-1/2 w-[1px] bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent" />

                  {/* Pulsing Sonar Pings */}
                  <div className="absolute inset-4 rounded-full border border-cyan-400/40 animate-radar-ping" />
                  <div
                    className="absolute inset-4 rounded-full border border-cyan-400/40 animate-radar-ping"
                    style={{ animationDelay: '1.3s' }}
                  />

                  {/* Rotating Radar Sweep Cone */}
                  <div className="absolute inset-0 rounded-full overflow-hidden animate-radar-sweep pointer-events-none">
                    <div
                      className="absolute top-1/2 left-1/2 w-[120px] h-[120px] origin-top-left"
                      style={{
                        background: `conic-gradient(from 180deg at 0% 0%, rgba(0, 242, 254, 0.45) 0deg, rgba(16, 185, 129, 0.2) 35deg, transparent 70deg)`,
                      }}
                    />
                  </div>

                  {/* Orbital Tech Ring */}
                  <div className="absolute inset-2 rounded-full border-t-2 border-r-2 border-cyan-400/60 animate-orbit-spin" />
                  <div className="absolute inset-6 rounded-full border-b-2 border-l-2 border-violet-400/50 animate-orbit-reverse" />

                  {/* Center Pulse Core */}
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950/90 border border-cyan-400/60 shadow-[0_0_25px_rgba(0,242,254,0.5)]">
                    <div className="absolute inset-0 rounded-full bg-cyan-400/20 animate-ping opacity-60" />
                    <Radar className="h-6 w-6 text-cyan-300 animate-pulse" />
                  </div>
                </div>

                {/* Animated Status Header with Sequential Loading Dots */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono-tech uppercase tracking-wider mb-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <span>1XBET ENGINE TELEMETRY ACTIVE</span>
                  </div>

                  <h4 className="font-display text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                    <span>AWAITING NEXT GAME ROUND</span>
                    {/* Continuous 60fps Loading Dots */}
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </h4>

                  <p className="mt-1.5 max-w-sm text-xs text-slate-400 leading-relaxed font-mono-tech">
                    Place your bet in the 1xBet app to begin. Predictions and live matrix outcomes will lock and stream here automatically.
                  </p>

                  {/* Live Sync Metrics Pill Bar */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono-tech text-slate-400">
                    <span className="px-2.5 py-1 rounded-md bg-white/[.04] border border-white/[.06] flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      FIREBASE /m11 CONNECTED
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-white/[.04] border border-white/[.06] flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      MATRIX 10×5 STANDBY
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-white/[.04] border border-white/[.06] flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                      PREDICTION ENGINE READY
                    </span>
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Active 10x5 Grid */
            <div className="flex flex-col gap-1.5 overflow-x-auto py-1">
              {rowsToDisplay.map((spec) => {
                const rowIndex = spec.row - 1
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
                            className={`relative flex h-10 items-center justify-center rounded-lg border text-xs font-medium transition-all duration-200 ${
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
                            {/* Icon visual: custom safe or broken apple images with crisp rendering & smooth transitions */}
                            {isSafe ? (
                              <img
                                src="/images/apple-safe.webp"
                                alt="Safe Apple"
                                onError={(e) => {
                                  e.currentTarget.src = '/images/apple-safe.png'
                                }}
                                className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(52,211,153,0.45)] transition-all duration-300 ease-out hover:scale-110"
                              />
                            ) : (
                              <img
                                src="/images/apple-broken.webp"
                                alt="Broken Apple"
                                onError={(e) => {
                                  e.currentTarget.src = '/images/apple-broken.png'
                                }}
                                className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(244,63,94,0.45)] transition-all duration-300 ease-out hover:scale-110"
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

        {/* Live Stats Panel (Right) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <LiveStatsPanel game={game} balanceState={balanceState} />
        </div>
      </div>

      {/* Row 2: Round History Panel */}
      <RoundHistoryPanel game={game} />

      {/* Persistent Last Game Summary Card */}
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

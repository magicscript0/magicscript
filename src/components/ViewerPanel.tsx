import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Crosshair,
  History,
  Radio,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
  Zap,
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
    <div className="relative flex w-full flex-col gap-6">
      {/* Dynamic Ambient Background Aura */}
      <div
        className={`pointer-events-none fixed inset-0 -z-10 transition-all duration-1000 ${
          game.active && (game.win_sum ?? 0) > (game.bet_sum ?? 0)
            ? 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,185,129,0.14),transparent_70%)]'
            : game.active
              ? 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.12),transparent_70%)]'
              : 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(30,41,59,0.2),transparent_70%)]'
        }`}
      />

      {/* Top Action Telemetry Bar */}
      <div className="cockpit-panel relative flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  game.active ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  game.active ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-500'
                }`}
              />
            </span>
            <span className="font-mono text-xs font-black tracking-wider uppercase text-slate-200">
              {game.active ? 'LIVE TELEMETRY STREAM' : 'STANDBY • WAITING FOR ROUND'}
            </span>
          </div>

          <div className="hidden items-center gap-1.5 font-mono text-xs text-slate-400 sm:flex">
            <Radio className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>1xBet Stream Synced (24ms)</span>
          </div>

          {game.account_id && (
            <span className="rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-0.5 font-mono text-xs font-bold text-slate-300">
              Account: <span className="text-cyan-300">#{game.account_id}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={game.loading || balanceState.loading}
          className="group flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 px-4 py-1.5 text-xs font-bold text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)] transition-all duration-300 hover:border-cyan-400 hover:brightness-125 hover:shadow-[0_0_18px_rgba(6,182,212,0.4)] active:scale-95 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 transition-transform duration-500 ${
              game.loading || balanceState.loading ? 'animate-spin' : 'group-hover:rotate-180'
            }`}
          />
          <span>Sync Radar Data</span>
        </button>
      </div>

      {/* Main Grid + Stats Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: 10x5 Apple Matrix Screen */}
        <div className="cockpit-panel relative flex flex-col gap-3.5 overflow-hidden rounded-3xl p-5 shadow-2xl lg:col-span-7">
          {/* Matrix Header */}
          <div className="relative flex flex-wrap items-center justify-between border-b border-white/[.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black tracking-widest uppercase text-slate-100">
                  Live 10×5 Telemetry Matrix
                </h3>
                <p className="text-[10px] font-medium text-slate-400">
                  خريطة التفاح الحية والتحركات في الوقت الفعلي
                </p>
              </div>
            </div>

            {/* Apple Icons Legend */}
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <img
                  src="/images/apple-safe.png"
                  alt="Safe Apple"
                  className="h-4 w-4 object-contain drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                />
                Safe Apple
              </span>
              <span className="h-3 w-[1px] bg-white/10" />
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <img
                  src="/images/apple-broken.png"
                  alt="Broken Apple"
                  className="h-4 w-4 object-contain drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                />
                Broken Apple
              </span>
            </div>
          </div>

          {!hasGame ? (
            showEndSummary && endedSummary ? (
              /* Cinematic End of Game Screen */
              <div
                className={`relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-2xl border p-8 text-center backdrop-blur-2xl shadow-2xl ${
                  endedSummary.outcome === 'WON'
                    ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-950/40 via-slate-950/90 to-black/95 shadow-[0_0_50px_rgba(16,185,129,0.2)]'
                    : 'border-rose-500/50 bg-gradient-to-b from-rose-950/40 via-slate-950/90 to-black/95 shadow-[0_0_50px_rgba(244,63,94,0.2)]'
                }`}
              >
                {/* Background Victory Aura */}
                <div
                  className={`pointer-events-none absolute -top-24 h-64 w-64 rounded-full blur-3xl opacity-40 ${
                    endedSummary.outcome === 'WON' ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                />

                {/* Hero Badge Icon */}
                <div
                  className={`relative mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border transition-transform duration-500 hover:scale-105 ${
                    endedSummary.outcome === 'WON'
                      ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/30 to-black shadow-[0_0_35px_rgba(16,185,129,0.4)]'
                      : 'border-rose-400/60 bg-gradient-to-br from-rose-500/30 to-black shadow-[0_0_35px_rgba(244,63,94,0.4)]'
                  }`}
                >
                  <img
                    src={endedSummary.outcome === 'WON' ? '/images/apple-safe.png' : '/images/apple-broken.png'}
                    alt={endedSummary.outcome}
                    className="h-12 w-12 object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]"
                  />
                  {endedSummary.outcome === 'WON' && (
                    <Trophy className="absolute -top-2 -right-2 h-7 w-7 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <h3
                    className={`text-2xl font-black tracking-wider uppercase ${
                      endedSummary.outcome === 'WON'
                        ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                        : 'text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                    }`}
                  >
                    {endedSummary.outcome === 'WON' ? '🏆 VICTORY CASHOUT' : '💀 TACTICAL BUST'}
                  </h3>
                </div>

                <p className="mt-1 font-mono text-xs text-slate-400">
                  Flight Session #{endedSummary.sessionId} Completed
                </p>

                {/* Financial Debrief Receipt */}
                <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-black/60 p-5 shadow-2xl backdrop-blur-md">
                  <div className="flex justify-between border-b border-white/[.06] py-2 text-xs">
                    <span className="text-slate-400">Initial Stake:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {endedSummary.startingBalance.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/[.06] py-2 text-xs">
                    <span className="text-slate-400">Final Balance:</span>
                    <span className="font-mono font-extrabold text-emerald-300">
                      {endedSummary.finalBalance.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/[.06] py-2 text-xs">
                    <span className="text-slate-400">
                      {endedSummary.outcome === 'WON' ? 'Net Profit:' : 'Net Loss:'}
                    </span>
                    <span
                      className={`font-mono text-sm font-black ${
                        endedSummary.netProfit >= 0
                          ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                          : 'text-rose-400'
                      }`}
                    >
                      {endedSummary.netProfit >= 0 ? '+' : ''}
                      {endedSummary.netProfit.toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/[.06] py-2 text-xs">
                    <span className="text-slate-400">Completed Altitude:</span>
                    <span className="font-mono font-bold text-cyan-300">
                      Row {endedSummary.finalRound} / 10
                    </span>
                  </div>
                  <div className="flex justify-between py-2 text-xs">
                    <span className="text-slate-400">Achieved Multiplier:</span>
                    <span className="font-mono font-black text-amber-300">
                      ×{endedSummary.multiplier.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* New Round Action Button */}
                <button
                  type="button"
                  onClick={handleNewRound}
                  className="mt-6 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 px-8 py-3 text-sm font-black tracking-wider uppercase text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_35px_rgba(16,185,129,0.6)] active:scale-95"
                >
                  <Zap className="h-4 w-4 fill-current" />
                  <span>Ready For Next Round</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* High-Tech Standby Radar Display */
              <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-black/30 p-8 text-center backdrop-blur-xl">
                {/* Concentric Radar Graphic */}
                <div className="relative mb-5 flex h-32 w-32 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
                  <div className="absolute inset-4 rounded-full border border-cyan-500/30" />
                  <div className="absolute inset-8 rounded-full border border-dashed border-cyan-500/40" />
                  <div
                    className="absolute inset-0 rounded-full border-t-2 border-cyan-400/80"
                    style={{ animation: 'radarSweep 4s linear infinite' }}
                  />
                  <Sparkles className="h-8 w-8 text-cyan-400 drop-shadow-[0_0_12px_#22d3ee] animate-pulse" />
                </div>

                <h4 className="text-sm font-black tracking-widest uppercase text-slate-100">
                  Telemetry Radar Standing By…
                </h4>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
                  ابدأ جولة جديدة في اللعبة أو قم باختيار أي تفاحة؛ وسيتم سحب البيانات الحية للشبكة
                  والتحركات تلقائياً في هذه الشاشة.
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 font-mono text-[11px] font-bold text-cyan-300">
                  <Radio className="h-3.5 w-3.5 animate-pulse" />
                  <span>LISTENING ON LIVE SOCKET</span>
                </div>
              </div>
            )
          ) : (
            /* Active 10x5 Grid with Tactile Cells */
            <div className="flex flex-col gap-2 overflow-x-auto py-1">
              {rowsToDisplay.map((spec) => {
                const rowIndex = spec.row - 1 // 0 to 9
                const isCurrent = rowIndex === currentRow
                const rawPick = userPicks[rowIndex]
                const pickedColIdx = normalizePickColIndex(rawPick)
                const rowCells = matrix ? matrix[rowIndex] : [1, 1, 1, 1, 1]
                const isApex = spec.row === 10

                // Tier styling for row multiplier
                const getMultiplierTierStyle = () => {
                  if (isApex) {
                    return 'border-amber-400/60 bg-gradient-to-r from-amber-500/25 to-yellow-500/20 text-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  }
                  if (spec.row >= 7) {
                    return 'border-purple-400/50 bg-purple-500/15 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                  }
                  if (spec.row >= 4) {
                    return 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                  }
                  return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                }

                return (
                  <div
                    key={spec.row}
                    className={`relative flex items-center gap-2.5 rounded-2xl border p-1.5 transition-all duration-300 ${
                      isCurrent
                        ? 'active-row-shimmer border-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.35)] ring-1 ring-cyan-400/60'
                        : isApex
                          ? 'jackpot-glow bg-gradient-to-r from-amber-950/20 to-black/40'
                          : rowIndex < currentRow
                            ? 'border-white/[.04] bg-black/30 opacity-80'
                            : 'border-white/[.025] bg-black/20'
                    }`}
                  >
                    {/* Active row pulse indicator banner */}
                    {isCurrent && (
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
                    )}

                    {/* Multiplier Pill on Left */}
                    <div
                      className={`flex w-20 flex-col items-center justify-center rounded-xl border px-2 py-1.5 font-mono transition-all ${getMultiplierTierStyle()}`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">
                        {isApex ? 'JACKPOT' : `ROW ${spec.row}`}
                      </span>
                      <span className="text-xs font-black">
                        {formatMultiplier(spec.multiplier)}
                      </span>
                    </div>

                    {/* 5 Tactile Cells */}
                    <div className="grid flex-1 grid-cols-5 gap-2">
                      {rowCells.map((cellValue, colIndex) => {
                        const isPicked = pickedColIdx === colIndex
                        const isSafe = cellValue === 1
                        const isRecommended = isCurrent && recommendedCols.includes(colIndex)

                        return (
                          <div
                            key={colIndex}
                            style={
                              isNewGameEntrance
                                ? { animationDelay: `${(spec.row - 1) * 70 + colIndex * 15}ms` }
                                : undefined
                            }
                            className={`group relative flex h-12 items-center justify-center rounded-xl border transition-all duration-200 ${
                              isNewGameEntrance ? 'animate-cell-entrance' : ''
                            } ${
                              isPicked
                                ? isSafe
                                  ? 'border-emerald-400 bg-gradient-to-b from-emerald-500/35 to-emerald-950/60 shadow-[0_0_20px_rgba(16,185,129,0.5)] ring-2 ring-emerald-400'
                                  : 'border-rose-400 bg-gradient-to-b from-rose-500/35 to-rose-950/60 shadow-[0_0_20px_rgba(244,63,94,0.5)] ring-2 ring-rose-400'
                                : isRecommended
                                  ? 'border-cyan-400/60 bg-cyan-500/15 shadow-[0_0_12px_rgba(6,182,212,0.3)] ring-1 ring-cyan-400/40'
                                  : isSafe
                                    ? 'border-emerald-500/20 bg-gradient-to-b from-white/[.04] to-black/40 hover:border-emerald-500/40'
                                    : 'border-rose-500/20 bg-gradient-to-b from-white/[.04] to-black/40 hover:border-rose-500/40'
                            }`}
                          >
                            {/* Inner Sunken Well Specular Highlight */}
                            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/[.06] to-transparent" />

                            {/* Apple Visual */}
                            <img
                              src={isSafe ? '/images/apple-safe.png' : '/images/apple-broken.png'}
                              alt={isSafe ? 'Safe Apple' : 'Broken Apple'}
                              className={`relative h-8 w-8 object-contain transition-transform duration-200 group-hover:scale-110 ${
                                isSafe
                                  ? 'drop-shadow-[0_0_10px_rgba(52,211,153,0.45)]'
                                  : 'drop-shadow-[0_0_10px_rgba(244,63,94,0.45)]'
                              }`}
                            />

                            {/* Holographic User Pick Reticle */}
                            {isPicked && (
                              <div className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-md border border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.7)] z-10">
                                <Crosshair className="h-2.5 w-2.5" />
                                <span>PICK</span>
                              </div>
                            )}

                            {/* Recommended Radar Target */}
                            {isRecommended && !isPicked && (
                              <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                              </div>
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

        {/* Right Column: Live Stats Panel */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <LiveStatsPanel game={game} balanceState={balanceState} />
        </div>
      </div>

      {/* Row 2: Tactical Flight Log (Round History) */}
      <RoundHistoryPanel game={game} />

      {/* Row 3: Persistent Last Game Avionics Summary */}
      {lastGame && (
        <div className="cockpit-panel flex flex-col gap-3 rounded-2xl p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-300">
              <History className="h-4 w-4 text-cyan-400" /> Previous Mission Summary:
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-black tracking-wider ${
                lastGame.outcome === 'WON'
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'border-rose-500/50 bg-rose-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
              }`}
            >
              {lastGame.outcome === 'WON' ? (
                <>
                  <Trophy className="h-3.5 w-3.5 text-amber-300" /> WON
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-rose-300" /> LOST
                </>
              )}
            </span>
            <span className="rounded-md border border-white/10 bg-white/[.04] px-2 py-0.5 font-mono text-xs font-bold text-slate-300">
              Session #{lastGame.sessionId}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <span className="text-slate-400">
              Net Result:{' '}
              <span
                className={`font-black ${
                  lastGame.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {lastGame.netProfit >= 0 ? '+' : ''}
                {lastGame.netProfit.toFixed(2)} EGP
              </span>
            </span>
            <span className="text-slate-400">
              Altitude:{' '}
              <span className="font-black text-cyan-300">{lastGame.finalRound}/10</span>
            </span>
            <span className="text-slate-400">
              Multiplier:{' '}
              <span className="font-black text-amber-300">×{lastGame.multiplier.toFixed(2)}</span>
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

import React, { useState, useEffect, useCallback } from 'react'
import {
  LogOut,
  Clock,
  Radio,
  Sparkles,
  ShieldCheck,
  Flame,
  Play,
  RotateCw,
  Eye,
  Gamepad2,
  RefreshCw,
} from 'lucide-react'
import {
  GRID_ROWS,
  REVEAL_ROW_DELAY_MS,
  REVEAL_ROW_DELAY_REDUCED_MOTION_MS,
  ROWS,
  formatMultiplier,
} from '../config/game'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { useLiveGame } from '../hooks/useLiveGame'
import { useBalance } from '../hooks/useBalance'
import { publishDemoRound } from '../services/m11'
import { generateDemoRound } from '../utils/generator'
import { validateM11Node } from '../utils/validation'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { prefersReducedMotion } from '../utils/random'
import { FortuneBoard } from './FortuneBoard'
import { ViewerToggle } from './ViewerToggle'
import { ViewerPanel } from './ViewerPanel'
import { CyberErrorBoundary } from './CyberErrorBoundary'
import type { ConsoleRound, RoundPhase } from '../types/game'

export interface GameConsoleViewProps {
  accountId: string
  remainingMs: number
  onLogout: () => void
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const GameConsoleView: React.FC<GameConsoleViewProps> = ({
  accountId,
  remainingMs,
  onLogout,
}) => {
  const [mode, setMode] = useState<'play' | 'viewer'>('play')
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  // Real backend connections from MAIN
  const mirror = useM11Mirror()
  const liveGame = useLiveGame(mode === 'viewer')
  const balanceState = useBalance(mode === 'viewer')

  const liveReady = mirror.active && mirror.status === 'valid' && mirror.evaluation !== null
  const canPublish = mirror.active && mirror.status !== 'error'
  const busy = phase === 'publishing' || phase === 'revealing'
  const lowTime = remainingMs < 120_000
  const tableState = !mirror.active ? 'OFFLINE' : liveReady ? 'LIVE' : 'STANDBY'

  // Play Mode: follows /m11 snapshot
  useEffect(() => {
    if (!liveReady || mirror.evaluation === null) {
      if (mirror.status !== 'syncing' && mirror.status !== 'idle') {
        setRound(null)
        setRevealedRows(0)
        setPhase('idle')
      }
      return
    }

    try {
      const rows = liveValuesToRows(mirror.evaluation.values)
      setRound({ source: 'live', createdAt: mirror.lastUpdated ?? Date.now(), rows })
      setPhase((current) => (current === 'idle' ? 'ready' : current))
    } catch {
      setRound(null)
      setRevealedRows(0)
      setPhase('idle')
      setNotice('The current game could not be displayed.')
    }
  }, [liveReady, mirror.evaluation, mirror.status, mirror.lastUpdated])

  // Play Mode: New Game Action
  const handleNewGame = useCallback(async () => {
    if (busy || !canPublish) return
    const wasReady = phase === 'ready' || phase === 'revealed'
    setNotice(null)
    setRevealedRows(0)
    setPhase('publishing')
    try {
      const candidate = generateDemoRound()
      const check = validateM11Node(candidate.node)
      if (!check.valid) throw new Error('Round validation failed.')
      await publishDemoRound(candidate.node)
      setPhase('ready')
    } catch {
      setPhase(wasReady ? 'ready' : 'idle')
      setNotice('The new game could not be started. Please try again.')
    }
  }, [busy, canPublish, phase])

  // Play Mode: Reveal Action
  const handleReveal = useCallback(() => {
    if (phase !== 'ready' || !round) return
    setNotice(null)
    setRevealedRows(0)
    setPhase('revealing')
  }, [phase, round])

  // Reveal step timer
  useEffect(() => {
    if (phase !== 'revealing') return
    if (revealedRows >= GRID_ROWS) {
      setPhase('revealed')
      return
    }
    const delay = prefersReducedMotion() ? REVEAL_ROW_DELAY_REDUCED_MOTION_MS : REVEAL_ROW_DELAY_MS
    const id = window.setTimeout(() => setRevealedRows((value) => value + 1), delay)
    return () => window.clearTimeout(id)
  }, [phase, revealedRows])

  function statusLine(): string {
    if (phase === 'publishing') return 'Starting a new game & publishing to /m11…'
    if (phase === 'revealing') return `Revealing predictions (Row ${revealedRows}/${GRID_ROWS})…`
    if (phase === 'ready') return 'Current game round loaded from Firebase /m11.'
    if (phase === 'revealed') return 'Full prediction matrix revealed.'
    return mirror.active ? 'Waiting for /m11 game round…' : 'Offline demo mode active.'
  }

  return (
    <div className="relative z-30 w-full max-w-5xl px-2.5 sm:px-6 py-4 sm:py-6 transition-all duration-700 ease-out">
      {/* Top Header Ribbon with Mode Switcher & Telemetry */}
      <div className="glass-panel-elevated rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3 sm:gap-4 border border-cyan-500/30 shadow-[0_15px_40px_rgba(0,0,0,0.8)]">
        {/* Left: Mode Switcher (Play Mode vs Viewer Mode) */}
        <div className="flex items-center gap-3">
          <ViewerToggle mode={mode} onChange={setMode} />
          <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono-tech tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span>OPTIMIZED FOR 1XBET APP</span>
          </div>
        </div>

        {/* Right: Realtime Status, Account ID, Remaining Timer & Disconnect */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Table / Connection state */}
          <div
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border font-mono-tech text-[11px] sm:text-xs font-bold ${
              tableState === 'LIVE'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                tableState === 'LIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
              }`}
            />
            <span>{mode === 'play' ? tableState : liveGame.active ? 'TELEMETRY LIVE' : 'STANDBY'}</span>
          </div>

          {/* Account ID Badge */}
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 font-mono-tech text-[11px] sm:text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Account:</span>
            <span className="text-white font-bold">#{accountId}</span>
          </div>

          {/* Real Remaining Session Countdown Timer */}
          <div
            className={`flex items-center gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border font-mono-tech text-[11px] sm:text-xs transition-colors ${
              lowTime
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                : 'bg-slate-900/80 border-slate-700 text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 hidden xs:inline">Remaining:</span>
            <span className="text-white font-bold">{formatRemaining(remainingMs)}</span>
          </div>

          {/* Logout / Disconnect Button */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-mono-tech text-[11px] sm:text-xs transition-colors shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DISCONNECT</span>
          </button>
        </div>
      </div>

      {/* Main Content Area based on Selected Mode */}
      {mode === 'viewer' ? (
        /* VIEWER MODE: Live Telemetry Engine, Matrix, Stats, & Round History */
        <div className="w-full">
          <CyberErrorBoundary moduleName="VIEWER TELEMETRY">
            <ViewerPanel game={liveGame} balanceState={balanceState} />
          </CyberErrorBoundary>
        </div>
      ) : (
        /* PLAY MODE: Apple of Fortune Prediction Board with /m11 Sync */
        <div className="flex flex-col gap-5">
          {/* Action Control Bar */}
          <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-cyan-500/25">
            <div className="flex items-center gap-2 text-xs font-mono-tech text-cyan-300">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>{statusLine()}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* New Game Button */}
              <button
                type="button"
                disabled={busy || !canPublish}
                onClick={handleNewGame}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-200 font-mono-tech font-bold text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(0,242,254,0.25)] hover:shadow-[0_0_20px_rgba(0,242,254,0.4)]"
              >
                <RotateCw className={`w-3.5 h-3.5 ${phase === 'publishing' ? 'animate-spin' : ''}`} />
                <span>NEW GAME</span>
              </button>

              {/* Reveal Prediction Button */}
              <button
                type="button"
                disabled={phase !== 'ready' || !round}
                onClick={handleReveal}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-mono-tech font-extrabold text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)]"
              >
                <Sparkles className="w-4 h-4" />
                <span>REVEAL PREDICTION</span>
              </button>
            </div>
          </div>

          {/* Notice Banner if any */}
          {notice && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 font-mono-tech text-xs">
              {notice}
            </div>
          )}

          {/* The Hero Apple of Fortune 10-Row Board */}
          <CyberErrorBoundary moduleName="FORTUNE PREDICTION BOARD">
            <FortuneBoard
              rows={round?.rows ?? null}
              phase={phase}
              revealedRows={revealedRows}
            />
          </CyberErrorBoundary>
        </div>
      )}
    </div>
  )
}

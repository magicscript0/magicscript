import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Eye, LogOut, Sparkles, Timer } from 'lucide-react'
import {
  GRID_ROWS,
  REVEAL_ROW_DELAY_MS,
  REVEAL_ROW_DELAY_REDUCED_MOTION_MS,
} from '../config/game'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { BrandMark } from '../components/BrandMark'
import { CyberBackdrop } from '../components/CyberBackdrop'
import { FortuneBoard } from '../components/FortuneBoard'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { prefersReducedMotion } from '../utils/random'
import type { ConsoleRound, RoundPhase } from '../types/game'

export interface FortuneProps {
  accountId: string
  /** Milliseconds of access remaining (server-derived). */
  remainingMs: number
  /** Voluntary exit back to the Game Login screen. */
  onExit: () => void
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Apple of Fortune — the public end-user game display.
 *
 * This screen is a READ-ONLY mirror of the current Firebase /m11 game state.
 * It never generates a local prediction, never publishes a round, and never
 * substitutes a local board for the database. The actual /m11 m1…m50 values
 * are the only source for the rendered board; if /m11 is unavailable the
 * screen shows an explicit loading/unavailable state instead of inventing a
 * result.
 *
 * Publish/new-round generation remains part of the separate operator/admin
 * Console workflow, not the public display.
 */
export function Fortune({ accountId, remainingMs, onExit }: FortuneProps) {
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const mirror = useM11Mirror()
  const liveReady = mirror.active && mirror.status === 'valid' && mirror.evaluation !== null

  useEffect(() => {
    document.title = 'Apple of Fortune'
  }, [])

  /* The public board follows /m11. A valid snapshot is the single source of
   * truth; an empty/invalid/unavailable node never produces a local result. */
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
      setNotice('The current game could not be displayed. Please try again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReady, mirror.evaluation, mirror.status])

  const handleReveal = useCallback(() => {
    if (phase !== 'ready' || !round) return
    setNotice(null)
    setRevealedRows(0)
    setPhase('revealing')
  }, [phase, round])

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

  function syncLabel(): string {
    if (!mirror.active) return 'The current game is unavailable.'
    switch (mirror.status) {
      case 'syncing':
        return 'Loading the current game…'
      case 'empty':
        return 'No current game has been published yet.'
      case 'incomplete':
        return 'The current game data is incomplete.'
      case 'invalid':
        return 'The current game data is unavailable.'
      case 'error':
        return 'The current game is temporarily unavailable.'
      default:
        return 'Waiting for the current game…'
    }
  }

  function statusLine(): string {
    if (phase === 'revealing') return 'Revealing the current game…'
    if (phase === 'ready') return 'Current game loaded.'
    if (phase === 'revealed') return 'Current game loaded.'
    return syncLabel()
  }

  return (
    <div className="fortune-screen">
      <CyberBackdrop density="calm" />
      <header className="relative z-10 flex items-center gap-2.5 px-3 pb-1 pt-2 sm:px-5">
        <BrandMark compact />
        <div className="min-w-0 leading-tight">
          <p className="text-[8px] font-bold uppercase tracking-[.22em] text-emerald-300/75">MAGIC SCRIPT</p>
          <h1 className="truncate text-base font-semibold tracking-[-.02em] text-slate-100">Apple of Fortune</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="hidden max-w-[110px] truncate rounded-full border border-white/[.1] bg-white/[.03] px-2.5 py-1 text-[10px] font-semibold text-slate-500 sm:inline" title="Account ID">#{accountId}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums ${remainingMs < 120_000 ? 'border-amber-300/30 bg-amber-300/[.08] text-amber-200' : 'border-emerald-300/20 bg-emerald-300/[.06] text-emerald-200'}`}
            aria-label={`Access time remaining ${formatRemaining(remainingMs)}`}
          >
            <Timer className="h-3.5 w-3.5" />
            {formatRemaining(remainingMs)}
          </span>
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit game"
            title="Exit game"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[.1] bg-white/[.025] text-slate-500 transition hover:border-rose-300/35 hover:text-rose-200"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="fortune-stage relative z-10 px-3 sm:px-5">
        <FortuneBoard rows={round?.rows ?? null} phase={phase} revealedRows={revealedRows} />
        {phase === 'idle' && round === null && (
          <div className="pointer-events-none absolute inset-x-3 inset-y-0 flex items-center justify-center sm:inset-x-5">
            <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-emerald-300/15 bg-[#080d0f]/85 p-5 text-center backdrop-blur-[3px]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[.08] text-emerald-300">
                {mirror.status === 'syncing' ? <CircleDot className="h-5 w-5 animate-pulse" /> : <Sparkles className="h-5 w-5" />}
              </span>
              <p className="text-sm font-semibold text-slate-200">{syncLabel()}</p>
              <p className="text-xs leading-5 text-slate-500">The live current game will appear here when it is available.</p>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-10 px-3 pb-2 pt-1 sm:px-5">
        <div aria-live="polite" className="mb-2 flex min-h-5 items-center justify-center gap-2 text-center text-xs font-medium text-slate-400">
          {phase === 'revealing' ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-emerald-300" /> : <span className="status-dot animate-pulse-soft bg-emerald-300" />}
          {statusLine()}
        </div>
        {notice && (
          <div role="alert" className="mx-auto mb-2 flex max-w-md items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-3.5 py-2.5 text-xs text-rose-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            {notice}
          </div>
        )}
        <div className="fortune-actions mx-auto grid w-full max-w-md grid-cols-1 gap-2.5">
          <button
            type="button"
            onClick={handleReveal}
            disabled={phase !== 'ready'}
            aria-label={phase === 'revealing' ? 'Revealing prediction' : phase === 'revealed' ? 'Prediction shown' : 'Reveal prediction'}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[.06] px-4 text-sm font-bold uppercase tracking-[.08em] text-amber-200 transition duration-200 hover:border-amber-300/55 hover:bg-amber-300/[.13] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === 'revealing' ? <CircleDot className="h-4 w-4 animate-pulse" /> : phase === 'revealed' ? <CheckCircle2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {phase === 'revealing' ? 'Revealing…' : phase === 'revealed' ? 'Shown' : 'Reveal'}
          </button>
        </div>
      </footer>
    </div>
  )
}

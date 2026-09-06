import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Eye, LogOut, Play, Sparkles, Timer } from 'lucide-react'
import { GRID_ROWS, REVEAL_ROW_DELAY_MS, REVEAL_ROW_DELAY_REDUCED_MOTION_MS } from '../config/game'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { publishDemoRound } from '../services/m11'
import { BrandMark } from '../components/BrandMark'
import { CyberBackdrop } from '../components/CyberBackdrop'
import { FortuneBoard } from '../components/FortuneBoard'
import { generateDemoRound, nodeToRows } from '../utils/generator'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { prefersReducedMotion } from '../utils/random'
import { validateM11Node } from '../utils/validation'
import type { ConsoleRound, RoundPhase, RowView } from '../types/game'

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

/** Row content comparison (same m1…m50 order by construction). */
function rowsEqual(a: readonly RowView[], b: readonly RowView[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const rowA = a[i]
    const rowB = b[i]
    if (rowA.row !== rowB.row || rowA.cells.length !== rowB.cells.length) return false
    for (let j = 0; j < rowA.cells.length; j += 1) {
      const cellA = rowA.cells[j]
      const cellB = rowB.cells[j]
      if (cellA.key !== cellB.key || cellA.value !== cellB.value) return false
    }
  }
  return true
}

/**
 * Apple of Fortune — the end-user game experience.
 *
 * The board is a read-only mirror of the CURRENT /m11 round (exactly what
 * APP 2 renders): the 50 cells always come from the latest validated
 * /m11 snapshot via liveValuesToRows — never from an independent local
 * prediction. The only place a prediction is created on this page is the
 * explicit NEW ROUND action, which generates one demo state, publishes it
 * to /m11 through the single guarded write path, and then shows exactly
 * that state. When the shared /m11 state is unreachable the page shows an
 * explicit unavailable state — it never invents a fallback prediction.
 *
 * No control-plane terms leak into the UI (no diagnostics, no statuses).
 */
export function Fortune({ accountId, remainingMs, onExit }: FortuneProps) {
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const mirror = useM11Mirror()
  /** The shared round source is reachable (configured, observer attached). */
  const connected = mirror.active && mirror.status !== 'error'
  const liveReady = mirror.active && mirror.status === 'valid' && mirror.evaluation !== null
  const busy = phase === 'revealing' || phase === 'publishing'

  useEffect(() => {
    document.title = 'Apple of Fortune'
  }, [])

  /* /m11 → board. The round on screen is ALWAYS the latest validated /m11
   * snapshot (the exact state APP 2 displays):
   *   - when nothing is held yet (idle), a valid snapshot is adopted
   *     automatically and becomes the current round;
   *   - while a round is on screen ('ready' or 'revealed' — not frozen in
   *     the middle of a reveal animation), any valid snapshot whose 50
   *     values differ replaces the rows in place, so a /m11 change is
   *     rendered exactly (e.g. one flipped child changes exactly that one
   *     board cell).
   * This effect NEVER calls the prediction generator: the rows come from
   * liveValuesToRows(mirror.evaluation.values) and nothing else.
   */
  useEffect(() => {
    if (!liveReady || !mirror.evaluation) return
    try {
      const rows = liveValuesToRows(mirror.evaluation.values)
      if (round === null) {
        if (phase !== 'idle') return
        setRound({ source: 'live', createdAt: mirror.lastUpdated ?? Date.now(), rows })
        setPhase('ready')
        return
      }
      if (phase !== 'ready' && phase !== 'revealed') return
      if (rowsEqual(round.rows, rows)) return
      if (mirror.lastUpdated !== null && mirror.lastUpdated < round.createdAt) return
      setRound({ source: 'live', createdAt: mirror.lastUpdated ?? Date.now(), rows })
    } catch {
      /* Never hold a partial snapshot. */
    }
  }, [liveReady, mirror.evaluation, mirror.lastUpdated, phase, round])

  /* NEW ROUND — the ONLY operation that creates a demo prediction on this
   * page, and it always lands in /m11 first: generate one round, validate
   * it against the contract, publish it through the single guarded write
   * path, then show exactly the published state. There is deliberately no
   * offline/local alternative: without the shared /m11 state the game
   * cannot invent a prediction that APP 2 would also see.
   */
  const handleNewRound = useCallback(async () => {
    if (busy || !connected) return
    const previousRound = round
    setNotice(null)
    setPhase('publishing')
    try {
      const candidate = generateDemoRound()
      const check = validateM11Node(candidate.node)
      if (!check.valid) throw new Error('Round validation failed.')
      await publishDemoRound(candidate.node)
      setRound({ source: 'published', seed: candidate.seed, createdAt: Date.now(), rows: nodeToRows(candidate.node) })
      setRevealedRows(0)
      setPhase('ready')
    } catch {
      setRound(previousRound)
      setPhase(previousRound ? 'ready' : 'idle')
      setNotice('The round could not be started. Please try again.')
    }
  }, [busy, connected, round])

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

  function statusLine(): string {
    if (phase === 'publishing') return 'Starting a new round…'
    if (phase === 'ready') return 'Reveal the prediction when you are ready.'
    if (phase === 'revealing') return 'Revealing the prediction…'
    if (phase === 'revealed') return 'Round complete — start another whenever you like.'
    if (liveReady) return 'The current round is ready for you.'
    if (connected) return 'Waiting for the current round…'
    return 'The current round is unavailable.'
  }

  const freshRoundWaiting = phase === 'revealed' && liveReady && mirror.lastUpdated !== null && round !== null && mirror.lastUpdated > round.createdAt

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
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-200">{connected ? 'Waiting for the current round…' : 'The current round is unavailable.'}</p>
              <p className="text-xs leading-5 text-slate-500">{connected ? 'You can also start a fresh round below.' : 'No prediction can be shown while the shared round is unreachable.'}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-10 px-3 pb-2 pt-1 sm:px-5">
        <div aria-live="polite" className="mb-2 flex min-h-5 items-center justify-center gap-2 text-center text-xs font-medium text-slate-400">
          {phase === 'publishing' ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-emerald-300" /> : <span className="status-dot animate-pulse-soft bg-emerald-300" />}
          {statusLine()}
        </div>
        {notice && (
          <div role="alert" className="mx-auto mb-2 flex max-w-md items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-3.5 py-2.5 text-xs text-rose-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            {notice}
          </div>
        )}
        <div className="fortune-actions mx-auto grid w-full max-w-md grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { void handleNewRound() }}
            disabled={busy || !connected}
            aria-label={phase === 'publishing' ? 'Starting new round' : 'New round'}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-emerald-300 to-teal-400 px-4 text-sm font-bold uppercase tracking-[.08em] text-[#052119] shadow-[0_8px_24px_rgba(70,227,161,.16)] transition duration-200 hover:from-emerald-200 hover:to-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && phase !== 'revealing' ? <CircleDot className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />}
            {phase === 'publishing' ? 'Starting…' : freshRoundWaiting ? 'Fresh round' : 'New round'}
          </button>
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

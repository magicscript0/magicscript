import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  GRID_ROWS,
  REVEAL_ROW_DELAY_MS,
  REVEAL_ROW_DELAY_REDUCED_MOTION_MS,
  START_SIMULATION_MS,
} from '../config/game'
import { useFirebaseConnection } from '../hooks/useFirebaseConnection'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { useSimulatedOnlineUsers } from '../hooks/useSimulatedOnlineUsers'
import { Header } from '../components/Header'
import { ActionButtons } from '../components/ActionButtons'
import { GameGrid } from '../components/GameGrid'
import { MirrorPanel } from '../components/MirrorPanel'
import { ConsoleLayout } from '../layouts/ConsoleLayout'
import { generateDemoRound, nodeToRows } from '../utils/generator'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { prefersReducedMotion } from '../utils/random'
import { validateM11Node } from '../utils/validation'
import { publishDemoRound } from '../services/m11'
import type { ConsoleRound, RoundPhase, RoundSource } from '../types/game'

export interface ConsoleProps {
  operatorId: string
  onLogout: () => void
}

const START_MESSAGES = [
  'Contacting demo engine…',
  'Generating 50 positions…',
  'Validating round contract…',
] as const

const BADGE_LABELS: Record<RoundSource, string> = {
  live: 'Firebase — Read Only',
  published: 'Firebase — Published',
  demo: 'Demo / Local Simulation',
}

const BADGE_CLASSES: Record<RoundSource, string> = {
  live: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  published: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  demo: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
}

const BADGE_DOTS: Record<RoundSource, string> = {
  live: 'bg-emerald-400',
  published: 'bg-sky-400',
  demo: 'bg-amber-400',
}

const BADGE_TITLES: Record<RoundSource, string> = {
  live: 'Grid mirrors the observed read-only /m11 snapshot (same data APP 2 reads)',
  published: 'This round was generated locally and published to /m11 — APP 2 receives the same round',
  demo: 'Locally generated simulation data — not from Firebase',
}

/** SCREEN 2 — the operator console (grid + ladder + actions + SHOW). */
export function Console({ operatorId, onLogout }: ConsoleProps) {
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [messageIndex, setMessageIndex] = useState(0)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)

  const onlineUsers = useSimulatedOnlineUsers()
  const connection = useFirebaseConnection()
  const mirror = useM11Mirror()

  const configured = mirror.active
  // LIVE load is only offered with a complete, contract-valid snapshot.
  const liveReady =
    mirror.active && mirror.status === 'valid' && mirror.evaluation !== null

  const nextSource: RoundSource = liveReady ? 'live' : 'demo'
  const badgeSource: RoundSource = round?.source ?? nextSource

  // LOAD LIVE ROUND — freeze the observed read-only /m11 snapshot.
  // Never generates; never writes; replaces the held round wholesale.
  const handleLoadLive = useCallback(() => {
    if (phase === 'generating' || phase === 'revealing' || phase === 'publishing') return
    if (!liveReady || !mirror.evaluation) return
    setError(null)
    setSuccess(null)
    setRevealedRows(0)

    try {
      setRound({
        source: 'live',
        createdAt: mirror.lastUpdated ?? Date.now(),
        rows: liveValuesToRows(mirror.evaluation.values),
      })
      setPhase('ready')
    } catch (cause) {
      console.error('[demo] live snapshot mapping failed', cause)
      setRound(null)
      setPhase('idle')
      setError('The live /m11 snapshot could not be mapped onto the grid. No data was changed.')
    }
  }, [phase, liveReady, mirror.evaluation, mirror.lastUpdated])

  // NEW GAME — the ONLY Firebase write in the app:
  // generate ONCE → validate → publish the SAME node → freeze the SAME node.
  // On failure: previous confirmed round stays intact, clear error, manual retry.
  const handleNewGame = useCallback(async () => {
    if (phase === 'generating' || phase === 'revealing' || phase === 'publishing') return
    if (!configured) return
    const previousPhase = phase
    const previousRound = round
    setError(null)
    setSuccess(null)
    setPublishMessage('Generating 50 cells…')
    setPhase('publishing')

    try {
      // 1. Generate exactly once.
      const candidate = generateDemoRound()

      // 2. Validate locally BEFORE publishing (belt and braces — the
      //    generator already validates; the service validates again).
      setPublishMessage('Validating round…')
      const check = validateM11Node(candidate.node)
      if (!check.valid) {
        throw new Error(`Generated round failed validation: ${check.errors.join(' ')}`)
      }

      // 3. Publish the SAME validated node to /m11 (single atomic update).
      setPublishMessage('Publishing to Firebase…')
      await publishDemoRound(candidate.node)

      // 4. Freeze the exact published object — never regenerated.
      setRound({
        source: 'published',
        seed: candidate.seed,
        createdAt: Date.now(),
        rows: nodeToRows(candidate.node),
      })
      setRevealedRows(0)
      setPhase('ready')
      setPublishMessage(null)
      setSuccess('New game published successfully.')
    } catch (cause) {
      // Keep the previous confirmed round; no auto-retry, no fake success.
      console.error('[demo] NEW GAME failed', cause)
      setPublishMessage(null)
      setRound(previousRound)
      setPhase(previousRound ? 'ready' : previousPhase === 'idle' ? 'idle' : 'idle')
      setError('Publish failed — current round was not replaced. Try NEW GAME again.')
    }
  }, [phase, round, configured])

  // NEW DEMO ROUND — offline-only local fallback; never publishes.
  const handleNewDemo = useCallback(() => {
    if (phase === 'generating' || phase === 'revealing' || phase === 'publishing') return
    setError(null)
    setSuccess(null)
    setRound(null)
    setRevealedRows(0)
    setMessageIndex(0)
    setPhase('generating')

    window.setTimeout(() => {
      try {
        const next = generateDemoRound()
        setRound({ source: 'demo', seed: next.seed, createdAt: next.createdAt, rows: next.rows })
        setPhase('ready')
      } catch (cause) {
        console.error('[demo] generator failure', cause)
        setPhase('idle')
        setError('The demo generator failed to create a valid round. Please try again.')
      }
    }, START_SIMULATION_MS)
  }, [phase])

  // Cycle the loading messages while a local demo round generates.
  useEffect(() => {
    if (phase !== 'generating') return
    const id = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % START_MESSAGES.length)
    }, START_SIMULATION_MS / (START_MESSAGES.length + 1))
    return () => window.clearInterval(id)
  }, [phase])

  // Live state consistency: when a NEWER valid snapshot arrives while a
  // live/published round is held but not yet shown, replace it WHOLESALE
  // (never mix rounds). During revealing/revealed the round stays FROZEN so
  // SHOW cannot change halfway through; a hint points at the newer data.
  useEffect(() => {
    if (!liveReady || !mirror.evaluation) return
    if (phase === 'ready' && (round?.source === 'live' || round?.source === 'published')) {
      try {
        setRound({
          source: round.source,
          createdAt: mirror.lastUpdated ?? Date.now(),
          rows: liveValuesToRows(mirror.evaluation.values),
        })
      } catch {
        /* keep the previously held round — never partial updates */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirror.evaluation])

  // SHOW — begin the progressive reveal of the frozen round.
  const handleShow = useCallback(() => {
    if (phase !== 'ready' || round === null) return
    setError(null)
    setSuccess(null)
    setPhase('revealing')
    setRevealedRows(0)
  }, [phase, round])

  // Progressive reveal: one row at a time, bottom (row 1) → top (row 10).
  useEffect(() => {
    if (phase !== 'revealing') return
    if (revealedRows >= GRID_ROWS) {
      setPhase('revealed')
      return
    }
    const delay = prefersReducedMotion()
      ? REVEAL_ROW_DELAY_REDUCED_MOTION_MS
      : REVEAL_ROW_DELAY_MS
    const id = window.setTimeout(() => setRevealedRows((rows) => rows + 1), delay)
    return () => window.clearTimeout(id)
  }, [phase, revealedRows])

  const safeCellCount = useMemo(
    () => round?.rows.flatMap((row) => row.cells).filter((cell) => cell.value === '1').length ?? 0,
    [round],
  )

  const newerSnapshotAvailable =
    (round?.source === 'live' || round?.source === 'published') &&
    mirror.lastUpdated !== null &&
    round.createdAt !== null &&
    mirror.lastUpdated > round.createdAt &&
    (phase === 'revealing' || phase === 'revealed')

  function statusLine(): string {
    if (phase === 'idle') {
      return liveReady
        ? 'Live /m11 snapshot available — load it, or start a NEW GAME.'
        : configured
          ? 'No round yet — start a NEW GAME (publishes to /m11).'
          : 'No round yet — start a new demo round.'
    }
    if (phase === 'generating') return 'Preparing demo round…'
    if (phase === 'publishing') return publishMessage ?? 'Publishing new game…'
    if (phase === 'ready') {
      if (round?.source === 'live') return 'Live /m11 round loaded — press SHOW to reveal it.'
      if (round?.source === 'published')
        return 'New game published successfully — press SHOW to reveal it.'
      return 'Demo round ready — press SHOW to reveal it.'
    }
    if (phase === 'revealing') return 'Revealing result…'
    if (round?.source === 'published')
      return 'Published round complete — start another NEW GAME when ready.'
    return round?.source === 'live'
      ? 'Live round complete — load the current /m11 again or start a NEW GAME.'
      : 'Demo round complete — start another new demo round.'
  }

  return (
    <ConsoleLayout
      header={
        <Header
          operatorId={operatorId}
          onlineUsers={onlineUsers}
          connection={connection}
          onLogout={onLogout}
        />
      }
    >
      <div className="space-y-5">
        {/* Round status line + explicit data-source badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-sm font-medium text-slate-300">
            {statusLine()}
            {phase === 'revealed' && (
              <span className="ml-2 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                {safeCellCount} safe cells
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {newerSnapshotAvailable && (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">
                Newer /m11 snapshot received — load it or start a NEW GAME
              </span>
            )}
            <span
              data-testid="data-source-badge"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${BADGE_CLASSES[badgeSource]}`}
              title={BADGE_TITLES[badgeSource]}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${BADGE_DOTS[badgeSource]}`}
              />
              {BADGE_LABELS[badgeSource]}
            </span>
            {round && (
              <p className="text-xs tabular-nums text-slate-600">
                {round.source === 'live'
                  ? `live /m11 · received ${new Date(round.createdAt).toLocaleTimeString()}`
                  : round.source === 'published'
                    ? `seed ${round.seed} · published ${new Date(round.createdAt).toLocaleTimeString()}`
                    : `seed ${round.seed} · generated ${new Date(round.createdAt).toLocaleTimeString()}`}
              </p>
            )}
          </div>
        </div>

        <ActionButtons
          phase={phase}
          liveReady={liveReady}
          firebaseConfigured={configured}
          onLoadLive={handleLoadLive}
          onNewGame={handleNewGame}
          onNewDemo={configured ? null : handleNewDemo}
          onShow={handleShow}
        />

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300 animate-fade-in"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {success && phase !== 'publishing' && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-200 animate-fade-in"
          >
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </p>
        )}

        {/* Generating message (offline local demo only) */}
        {phase === 'generating' && (
          <p className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-center text-sm font-medium text-cyan-200 animate-pulse-soft">
            {START_MESSAGES[messageIndex]}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              (demo simulation)
            </span>
          </p>
        )}

        {/* Publishing progress (NEW GAME) */}
        {phase === 'publishing' && (
          <p
            data-testid="publish-status"
            className="flex items-center justify-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/5 px-4 py-3 text-center text-sm font-medium text-sky-200 animate-pulse-soft"
          >
            {publishMessage ?? 'Publishing new game…'}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              (writes /m11 once)
            </span>
          </p>
        )}

        <GameGrid
          rows={round?.rows ?? null}
          phase={phase}
          revealedRows={revealedRows}
          nextSource={liveReady ? 'live' : 'demo'}
        />

        {/* Reveal progress */}
        {(phase === 'revealing' || phase === 'revealed') && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span aria-live="polite">
              Row {Math.min(revealedRows, GRID_ROWS)} of {GRID_ROWS} revealed
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${(Math.min(revealedRows, GRID_ROWS) / GRID_ROWS) * 100}%` }}
              />
            </div>
          </div>
        )}

        <MirrorPanel connection={connection} mirror={mirror} />
      </div>
    </ConsoleLayout>
  )
}

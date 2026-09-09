import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Eye, LogOut, Play, Sparkles, Timer } from 'lucide-react'
import {
  GRID_ROWS,
  REVEAL_ROW_DELAY_MS,
  REVEAL_ROW_DELAY_REDUCED_MOTION_MS,
  ROWS,
  formatMultiplier,
} from '../config/game'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { publishDemoRound } from '../services/m11'
import { CyberBackdrop } from '../components/CyberBackdrop'
import { GameBrandLockup } from '../components/GameBrand'
import { FortuneBoard } from '../components/FortuneBoard'
import { generateDemoRound } from '../utils/generator'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { validateM11Node } from '../utils/validation'
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

/** The multiplier ladder the board walks, e.g. ×1.23 → ×349.68. */
const LADDER_RANGE = `${formatMultiplier(ROWS[0].multiplier)} → ${formatMultiplier(ROWS[ROWS.length - 1].multiplier)}`

/**
 * Apple of Fortune — the public end-user game display.
 *
 * The current board is always a mirror of Firebase `/m11`: the public screen
 * never keeps a separate prediction or a locally generated board. The
 * "New game" action reuses the existing validated generator + guarded
 * publisher from the operator Console, writes the round to `/m11`, and then
 * lets the existing Firebase `onValue` listener update this display. Nothing
 * is shown from a second local board.
 *
 * Everything below the state machine is public-only presentation (`.pg-*`
 * classes): the reveal timing, the countdown, the /m11 read path and the
 * "1"/"0" → SAFE/BROKEN mapping are exactly the ones that were already there.
 */
export function Fortune({ accountId, remainingMs, onExit }: FortuneProps) {
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const mirror = useM11Mirror()
  const liveReady = mirror.active && mirror.status === 'valid' && mirror.evaluation !== null
  const canPublish = mirror.active && mirror.status !== 'error'
  const busy = phase === 'publishing' || phase === 'revealing'
  const lowTime = remainingMs < 120_000
  const tableState = !mirror.active ? 'OFFLINE' : liveReady ? 'LIVE' : 'STANDBY'

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
      // Do NOT build a second local board here. The /m11 onValue listener
      // receives the published round and updates the mirrored board below.
      setPhase('ready')
    } catch {
      setPhase(wasReady ? 'ready' : 'idle')
      setNotice('The new game could not be started. Please try again.')
    }
  }, [busy, canPublish, phase])

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
    if (phase === 'publishing') return 'Starting a new game…'
    if (phase === 'revealing') return 'Revealing the current game…'
    if (phase === 'ready') return 'Current game loaded.'
    if (phase === 'revealed') return 'Current game loaded.'
    return syncLabel()
  }

  return (
    <div className={`fortune-screen pg-game${phase === 'revealing' ? ' is-revealing' : ''}`}>
      {/* The game is the strongest scene in the world: the full ambient
          field, exactly like login, so the three screens are one place.
          While the ladder reveals, the field yields its frame budget
          (focus: half cadence + sweep paused) and the room eases back
          (see .pg-game.is-revealing rules) — the board owns the screen,
          the field never stops moving. */}
      <CyberBackdrop density="full" focus={phase === 'revealing'} />

      <header className="pg-bar">
        <GameBrandLockup variant="compact" />
        <div className="pg-bar__side">
          <span className={`pg-pill pg-pill--state${liveReady ? ' is-live' : ''}`} title="Current game">
            <span className="pg-pill__dot" aria-hidden="true" />
            <span className="pg-pill__text">{tableState}</span>
          </span>
          <span className="pg-pill pg-pill--account" title="Account ID">
            <span className="pg-pill__key">Account</span>
            <span className="pg-pill__value mono">#{accountId}</span>
          </span>
          <span
            className={`pg-pill pg-pill--timer${lowTime ? ' is-low' : ''}`}
            aria-label={`Access time remaining ${formatRemaining(remainingMs)}`}
          >
            <Timer className="pg-pill__icon" aria-hidden="true" />
            <span className="pg-pill__value">{formatRemaining(remainingMs)}</span>
          </span>
          <button
            type="button"
            onClick={onExit}
            aria-label="Exit game"
            title="Exit game"
            className="pg-iconbtn"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="fortune-stage">
        <div className={`pg-board${phase === 'revealing' ? ' is-revealing' : ''}${phase === 'revealed' ? ' is-revealed' : ''}${busy ? ' is-busy' : ''}`}>
          <span className="pg-board__corner pg-board__corner--tl" aria-hidden="true" />
          <span className="pg-board__corner pg-board__corner--tr" aria-hidden="true" />
          <span className="pg-board__corner pg-board__corner--bl" aria-hidden="true" />
          <span className="pg-board__corner pg-board__corner--br" aria-hidden="true" />

          <div className="pg-board__head">
            <span className="pg-eyebrow">Multiplier</span>
            <span className="pg-board__rule" aria-hidden="true" />
            <span className="pg-board__ladder mono">{LADDER_RANGE}</span>
            <span className="pg-board__split" aria-hidden="true" />
            <span className="pg-legend">
              <span className="pg-legend__item">
                <span className="pg-dot pg-dot--safe" aria-hidden="true" />
                Safe
              </span>
              <span className="pg-legend__item">
                <span className="pg-dot pg-dot--broken" aria-hidden="true" />
                Broken
              </span>
            </span>
          </div>

          <FortuneBoard rows={round?.rows ?? null} phase={phase} revealedRows={revealedRows} />
          <span className="pg-board__scan" aria-hidden="true" />
          <span className="pg-board__shine" aria-hidden="true" />
        </div>

        {phase === 'idle' && round === null && (
          <div className="pg-idle">
            <div className="pg-idle__card">
              <span className="pg-idle__crest">
                {mirror.status === 'syncing' ? <CircleDot className="h-5 w-5 animate-pulse" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
              </span>
              <p className="pg-idle__title">{syncLabel()}</p>
              <p className="pg-idle__copy">The live current game will appear here when it is available.</p>
              <span className="pg-idle__loader" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      <footer className="pg-dock">
        <div aria-live="polite" className="pg-dock__status">
          {phase === 'publishing' || phase === 'revealing' ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-emerald-300" aria-hidden="true" /> : <span className="status-dot animate-pulse-soft bg-emerald-300" aria-hidden="true" />}
          <span>{statusLine()}</span>
        </div>
        {notice && (
          <div role="alert" className="pg-note pg-note--error pg-dock__alert">
            <AlertTriangle className="pg-note__icon" aria-hidden="true" />
            <p>{notice}</p>
          </div>
        )}
        <div className="pg-dock__actions">
          <button
            type="button"
            onClick={() => { void handleNewGame() }}
            disabled={busy || !canPublish}
            aria-label={phase === 'publishing' ? 'Starting new game' : 'New game'}
            className={`pg-btn pg-btn--primary pg-dock__primary${phase === 'publishing' ? ' is-busy' : ''}`}
          >
            {phase === 'publishing' ? <span className="pg-btn__spinner pg-btn__spinner--dark" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            <span>{phase === 'publishing' ? 'Starting…' : 'New game'}</span>
          </button>
          <button
            type="button"
            onClick={handleReveal}
            disabled={phase !== 'ready' || round === null}
            aria-label={phase === 'revealing' ? 'Revealing prediction' : phase === 'revealed' ? 'Prediction shown' : 'Reveal prediction'}
            className={`pg-btn pg-btn--amber pg-dock__secondary${phase === 'revealing' ? ' is-busy' : ''}`}
          >
            {phase === 'revealing' ? <CircleDot className="h-4 w-4 animate-pulse" aria-hidden="true" /> : phase === 'revealed' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            <span>{phase === 'revealing' ? 'Revealing…' : phase === 'revealed' ? 'Shown' : 'Reveal'}</span>
          </button>
        </div>
      </footer>
    </div>
  )
}

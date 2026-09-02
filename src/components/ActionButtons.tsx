import { Check, Dices, Download, Eye, Loader2, Rocket } from 'lucide-react'
import type { RoundPhase } from '../types/game'

export interface ActionButtonsProps {
  phase: RoundPhase
  /** True when the live /m11 snapshot is valid (50/50) and can be loaded. */
  liveReady: boolean
  /** True when Firebase is configured (NEW GAME can publish). */
  firebaseConfigured: boolean
  onLoadLive: () => void
  onNewGame: () => void
  /** Local-only fallback — only rendered when Firebase is not configured. */
  onNewDemo: (() => void) | null
  onShow: () => void
}

const BASE_BUTTON =
  'inline-flex h-[52px] flex-1 min-w-[150px] items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-extrabold uppercase tracking-wider transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:min-w-[180px]'

/**
 * Clearly separated actions:
 * - LOAD LIVE ROUND  — freeze the observed read-only /m11 snapshot.
 * - NEW GAME         — generate → validate → PUBLISH a new round to /m11
 *                      (the single Firebase write in the app).
 * - NEW DEMO ROUND   — offline-only local simulation (never publishes).
 * - SHOW             — progressive reveal of the held round.
 */
export function ActionButtons({
  phase,
  liveReady,
  firebaseConfigured,
  onLoadLive,
  onNewGame,
  onNewDemo,
  onShow,
}: ActionButtonsProps) {
  const busy =
    phase === 'generating' || phase === 'revealing' || phase === 'publishing'
  const revealing = phase === 'revealing'
  const publishing = phase === 'publishing'

  const liveDisabled = !liveReady || busy
  const newGameDisabled = !firebaseConfigured || busy
  const showDisabled = phase !== 'ready'

  const liveTitle = !liveReady
    ? 'The live /m11 snapshot is not currently valid/available — see the database panel below.'
    : busy
      ? 'Unavailable while a round is generating, publishing, or revealing.'
      : 'Freeze the current read-only /m11 snapshot (same data APP 2 displays). No write.'

  const newGameTitle = !firebaseConfigured
    ? 'NEW GAME needs Firebase configuration (.env with the database URL) — it publishes the new round to /m11.'
    : busy
      ? 'Unavailable while a round is generating, publishing, or revealing.'
      : 'Generate → validate → publish a brand-new round to Firebase /m11 (APP 2 receives it automatically).'

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
      <button
        type="button"
        onClick={onLoadLive}
        disabled={liveDisabled}
        aria-label="Load Live Round"
        title={liveTitle}
        className={`${BASE_BUTTON} bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 hover:shadow-emerald-400/30 focus-visible:outline-emerald-300 active:scale-[0.98]`}
      >
        <Download aria-hidden="true" className="h-5 w-5" />
        Load Live Round
      </button>

      <button
        type="button"
        onClick={onNewGame}
        disabled={newGameDisabled}
        aria-label={publishing ? 'Publishing new game' : 'New Game'}
        title={newGameTitle}
        className={`${BASE_BUTTON} bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-sky-400 hover:shadow-cyan-400/30 focus-visible:outline-cyan-300 active:scale-[0.98]`}
      >
        {publishing ? (
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        ) : (
          <Rocket aria-hidden="true" className="h-5 w-5" />
        )}
        {publishing ? 'Publishing…' : 'New Game'}
      </button>

      {onNewDemo !== null && (
        <button
          type="button"
          onClick={onNewDemo}
          disabled={busy}
          aria-label={phase === 'generating' ? 'Preparing demo round' : 'New Demo Round'}
          title="Offline fallback: generate a LOCAL demo round — never touches Firebase."
          className={`${BASE_BUTTON} border-2 border-cyan-400/50 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 focus-visible:outline-cyan-300 active:scale-[0.98]`}
        >
          {phase === 'generating' ? (
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          ) : (
            <Dices aria-hidden="true" className="h-5 w-5" />
          )}
          {phase === 'generating' ? 'Preparing…' : 'New Demo Round'}
        </button>
      )}

      <button
        type="button"
        onClick={onShow}
        disabled={showDisabled}
        aria-label={revealing ? 'Revealing…' : phase === 'revealed' ? 'Result shown' : 'Show'}
        className={`${BASE_BUTTON} border-2 border-amber-400/70 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 focus-visible:outline-amber-300 active:scale-[0.98]`}
      >
        {revealing ? (
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        ) : phase === 'revealed' ? (
          <Check aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Eye aria-hidden="true" className="h-5 w-5" />
        )}
        {revealing ? 'Revealing…' : phase === 'revealed' ? 'Result shown' : 'Show'}
      </button>
    </div>
  )
}

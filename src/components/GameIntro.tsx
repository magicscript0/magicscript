import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../utils/random'
import { GameBrandMark } from './GameBrand'

/**
 * PREMIUM BOOT / LOADING SCREEN — public game flow only.
 *
 * Two modes share one visual identity:
 *
 *  · `boot`     — the intro that plays once per page load before the login.
 *                 A determinate readout eases to 100 %, then the screen
 *                 dissolves and hands the stage over to the login (`onFinish`).
 *  · `checking` — the same screen held open while a stored game session is
 *                 revalidated server-side. Indeterminate: it never resolves on
 *                 its own, because the verdict belongs to the session hook.
 *
 * Pure presentation — no access logic, no fetching, no routing. The animation
 * budget is a handful of composited layers (no canvas, no layout thrash) and
 * everything is still under `prefers-reduced-motion`, where the sequence
 * collapses to a single 100 % frame before the reveal.
 */

export type GameIntroMode = 'boot' | 'checking'

export interface GameIntroProps {
  mode?: GameIntroMode
  /** Fires when the dissolve begins — the screen underneath may fade in. */
  onReveal?: () => void
  /** Fires when the boot sequence is gone; the intro may unmount. */
  onFinish?: () => void
}

interface BootStage {
  readonly label: string
  readonly target: number
}

/** Scripted boot curve — each stage eases into its own target percentage. */
const BOOT_STAGES: readonly BootStage[] = [
  { label: 'Initializing secure session', target: 34 },
  { label: 'Authorizing access channel', target: 62 },
  { label: 'Loading prediction table', target: 87 },
  { label: 'Calibrating interface', target: 100 },
]

/**
 * Readout cadence. The meter is smoothed by a 110ms CSS transition, so 20
 * updates a second are indistinguishable from 33 — and every one of them is a
 * React commit competing with the ambient field on the way into the login.
 */
const BOOT_TICK_MS = 50
const BOOT_DURATION_MS = 1_500
/** A beat on the finished frame before the curtain lifts. */
const BOOT_HOLD_MS = 180
/** Dissolve duration; keep in sync with the .pg-intro transition. */
const BOOT_EXIT_MS = 520
/** Reduced motion: one lit frame, then straight to the login. */
const REDUCED_HOLD_MS = 220

/** The boot curtain plays once per page load — it never replays after a sign-out. */
let bootCompleted = false

export function hasGameIntroCompleted(): boolean {
  return bootCompleted
}

/** Test seam: return to a pristine pre-boot state. */
export function resetGameIntroState(): void {
  bootCompleted = false
}

interface BootFrame {
  readonly progress: number
  readonly stage: number
  readonly complete: boolean
}

function bootFrame(elapsedMs: number, durationMs: number): BootFrame {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs))
  const stage = Math.min(BOOT_STAGES.length - 1, Math.floor(t * BOOT_STAGES.length))
  const local = Math.min(1, t * BOOT_STAGES.length - stage)
  const from = stage === 0 ? 0 : BOOT_STAGES[stage - 1].target
  const to = BOOT_STAGES[stage].target
  // Ease-out inside every stage: quick pick-up, gentle arrival — reads as
  // real work completing rather than a linear filler bar.
  const eased = 1 - Math.pow(1 - local, 2.1)
  return {
    progress: t >= 1 ? 100 : Math.round(from + (to - from) * eased),
    stage,
    complete: t >= 1,
  }
}

export function GameIntro({ mode = 'boot', onReveal, onFinish }: GameIntroProps) {
  const checking = mode === 'checking'
  const [frame, setFrame] = useState<BootFrame>(() =>
    checking ? { progress: 0, stage: 0, complete: false } : bootFrame(0, BOOT_DURATION_MS),
  )
  const [leaving, setLeaving] = useState(false)
  const finishRef = useRef(onFinish)
  const revealRef = useRef(onReveal)

  useEffect(() => {
    finishRef.current = onFinish
    revealRef.current = onReveal
  }, [onFinish, onReveal])

  useEffect(() => {
    if (mode !== 'boot') return
    const timers: number[] = []
    const notify = () => {
      bootCompleted = true
      finishRef.current?.()
    }
    /** Begin the hand-over: the login fades in while the curtain dissolves. */
    const dissolve = () => {
      setLeaving(true)
      revealRef.current?.()
    }

    if (prefersReducedMotion()) {
      setFrame({ progress: 100, stage: BOOT_STAGES.length - 1, complete: true })
      dissolve()
      timers.push(window.setTimeout(notify, REDUCED_HOLD_MS))
      return () => {
        for (const id of timers) window.clearTimeout(id)
      }
    }

    // Wall-clock based so a throttled background tab still resolves promptly
    // — the login is never left waiting behind the curtain.
    const startedAt = Date.now()
    let lastProgress = -1
    let lastStage = -1
    const interval = window.setInterval(() => {
      const next = bootFrame(Date.now() - startedAt, BOOT_DURATION_MS)
      /* Nothing painted changes unless the rounded percentage or the stage
         label moved, so identical frames are never committed at all. */
      if (next.progress === lastProgress && next.stage === lastStage && !next.complete) return
      lastProgress = next.progress
      lastStage = next.stage
      setFrame(next)
      if (!next.complete) return
      window.clearInterval(interval)
      timers.push(window.setTimeout(() => {
        dissolve()
        timers.push(window.setTimeout(notify, BOOT_EXIT_MS))
      }, BOOT_HOLD_MS))
    }, BOOT_TICK_MS)

    return () => {
      window.clearInterval(interval)
      for (const id of timers) window.clearTimeout(id)
    }
  }, [mode])

  const status = checking ? 'Checking your access…' : BOOT_STAGES[frame.stage].label
  const percent = checking ? null : Math.min(100, frame.progress)
  /*
   * The meter is published as one 0–1 custom property and consumed by two
   * composited transforms (scaleX for the fill, translateX for the head). It
   * used to animate `width` and `left`, which ran a layout pass on every tick
   * of the boot sequence — the visible stutter on the way into the login.
   * The 1.2 % floor is the old `min-width: 3px` nub, expressed as a scale.
   */
  const meterStyle = { '--pg-meter-p': Math.max(0.012, (percent ?? 0) / 100) } as CSSProperties

  return (
    <div className={`pg-intro${leaving ? ' pg-intro--leaving' : ''}`} aria-busy="true">
      <div className="pg-intro__scrim" aria-hidden="true" />
      <div className="pg-intro__floor" aria-hidden="true">
        <span className="pg-intro__floor-grid" />
      </div>
      <div className="pg-intro__sweep" aria-hidden="true" />
      <div className="pg-intro__lines" aria-hidden="true" />
      <div className="pg-intro__shutter" aria-hidden="true" />
      <span className="pg-intro__corner pg-intro__corner--tl" aria-hidden="true" />
      <span className="pg-intro__corner pg-intro__corner--tr" aria-hidden="true" />
      <span className="pg-intro__corner pg-intro__corner--bl" aria-hidden="true" />
      <span className="pg-intro__corner pg-intro__corner--br" aria-hidden="true" />

      <div className="pg-intro__body">
        <div className="pg-intro__brand">
          <span className="pg-intro__crest" aria-hidden="true">
            <GameBrandMark size="full" halo />
          </span>
          <p className="pg-intro__word pg-glitch" data-text="MAGIC SCRIPT">
            MAGIC SCRIPT
          </p>
          <p className="pg-intro__sub">Apple of Fortune</p>
        </div>

          <div className="pg-intro__instrument">
            <div
              className={`pg-meter${checking ? ' pg-meter--indeterminate' : ''}`}
              style={meterStyle}
              role="progressbar"
              aria-label="Loading MAGIC SCRIPT"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent === null ? undefined : percent}
              aria-valuetext={percent === null ? 'Verifying access' : `${percent}%`}
            >
              <span className="pg-meter__track" />
              <span className="pg-meter__fill" />
              {percent === null ? null : <span className="pg-meter__head" />}
              <span className="pg-meter__ticks" />
            </div>

            <div className="pg-intro__readout">
              <p className="pg-intro__status">
                <span className="pg-intro__pulse" aria-hidden="true" />
                {status}
              </p>
              {percent === null ? null : <span className="pg-intro__percent">{percent}%</span>}
            </div>

            <div className="pg-intro__gauges">
              <span className="pg-eyebrow">{checking ? 'Verifying session' : `Stage ${frame.stage + 1} / ${BOOT_STAGES.length}`}</span>
              <span className="pg-intro__pips" aria-hidden="true">
                {BOOT_STAGES.map((stage, index) => (
                  <span key={stage.label} className={`pg-pip${!checking && index <= frame.stage ? ' is-on' : ''}`} />
                ))}
              </span>
            </div>
          </div>
      </div>

      <p className="pg-intro__foot">Time-limited access · verified on the server</p>
    </div>
  )
}

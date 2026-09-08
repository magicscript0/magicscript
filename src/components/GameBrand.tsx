import { Command } from 'lucide-react'

/**
 * PUBLIC-GAME brand lockup.
 *
 * A dedicated presentation layer for the end-user flow (boot screen, login,
 * Apple of Fortune board). The admin area keeps its own shared
 * `BrandMark`/`Header` components untouched — the two experiences are styled
 * independently on purpose.
 */

export interface GameBrandMarkProps {
  /** `full` is the centred hero crest, `compact` is the in-bar identity. */
  size?: 'full' | 'compact'
  /** Adds the slow halo/breathing ring used by the boot screen. */
  halo?: boolean
}

export function GameBrandMark({ size = 'full', halo = false }: GameBrandMarkProps) {
  const glyph = size === 'full' ? 'h-[22px] w-[22px] sm:h-6 sm:w-6' : 'h-4 w-4'
  return (
    <span
      aria-hidden="true"
      className={`pg-mark pg-mark--${size}${halo ? ' pg-mark--halo' : ''}`}
    >
      <span className="pg-mark__ring" />
      <span className="pg-mark__plate">
        <Command className={glyph} strokeWidth={2.4} />
      </span>
    </span>
  )
}

export interface GameBrandLockupProps {
  /** `full` = centred login crest, `compact` = single-row game header. */
  variant?: 'full' | 'compact'
  /** Optional supporting line under the product name (login screen only). */
  caption?: string
}

export function GameBrandLockup({ variant = 'full', caption }: GameBrandLockupProps) {
  const wordmark = <span className="pg-brand__word pg-glitch" data-text="MAGIC SCRIPT">MAGIC SCRIPT</span>
  const title = <h1 className="pg-brand__title">Apple of Fortune</h1>

  if (variant === 'compact') {
    return (
      <div className="pg-brand pg-brand--compact">
        <GameBrandMark size="compact" />
        <div className="pg-brand__text">
          {wordmark}
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="pg-brand pg-brand--full">
      <div className="pg-brand__crest">
        <GameBrandMark halo />
      </div>
      {wordmark}
      {title}
      {caption ? <p className="pg-brand__caption">{caption}</p> : null}
    </div>
  )
}

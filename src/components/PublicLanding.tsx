import { ArrowRight } from 'lucide-react'
import { GameBrandMark } from './GameBrand'
import { GameSocialLinks } from './GameSocialLinks'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import type { ControlSettings } from '../types/supabase'

export interface PublicLandingProps {
  /**
   * Fired once when the visitor requests the experience. The flow opens the
   * access gateway that is already mounted underneath; the landing itself
   * performs no verification and touches no session state.
   */
  onEnter: () => void
  /** Admin-controlled public settings (community links), same source as the gateway. */
  settings?: ControlSettings
  /** True while the exit dissolve runs; the flow unmounts the layer after. */
  exiting?: boolean
}

/**
 * The public front face of MAGIC SCRIPT — the discovery layer of the journey:
 *
 *   DISCOVER (the brand) → UNDERSTAND (what this is) → ENTER (one action)
 *
 * Presentation only: one crest, one wordmark, one title, one line of
 * positioning, the live system status, one primary action and the real
 * community links. Everything else (the access terminal, the game) stays
 * behind it. The live system chips in the corners are owned by the flow, so
 * the landing, the gateway and the game all share one unified system chrome.
 */
export function PublicLanding({ onEnter, settings = DEFAULT_CONTROL_SETTINGS, exiting = false }: PublicLandingProps) {
  return (
    <section
      className={`pg-landing${exiting ? ' pg-landing--exiting' : ''}`}
      aria-label="MAGIC SCRIPT — public experience"
    >
      <div className="pg-landing__bloom" aria-hidden="true" />
      <div className="pg-landing__ring" aria-hidden="true" />
      <div className="pg-landing__stack">
        <div className="pg-landing__crest">
          <GameBrandMark size="full" halo />
        </div>
        <p className="pg-landing__word pg-glitch" data-text="MAGIC SCRIPT">
          MAGIC SCRIPT
        </p>
        <p className="pg-landing__title">Apple of Fortune</p>
        <p className="pg-landing__tagline">
          A premium, time-limited game of fortune. Enter with your Account ID and Access Code.
        </p>
        <p className="pg-landing__status">
          <span className="pg-brand__status-dot" aria-hidden="true" />
          System operational
        </p>
        <button type="button" className="pg-btn pg-btn--portal" onClick={onEnter}>
          Enter experience
          <ArrowRight className="pg-btn__arrow" aria-hidden="true" />
        </button>
        <div className="pg-landing__social">
          <GameSocialLinks links={settings.social} />
        </div>
        <p className="pg-landing__foot">© MAGIC SCRIPT</p>
      </div>
    </section>
  )
}

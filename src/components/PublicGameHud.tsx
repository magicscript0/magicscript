import { Clock3 } from 'lucide-react'
import { useConfiguredOnlineUsers } from '../hooks/useConfiguredOnlineUsers'
import { useLocalClock } from '../hooks/useLocalClock'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import { formatLocalDateTime } from '../utils/localClock'
import type { DisplaySettings } from '../types/supabase'

/**
 * The two public HUD chips shown in the upper area of the Public Login / Game
 * interface: a demo "live activity" estimate and the visitor's REAL local
 * date + time (minute precision, no seconds).
 *
 * Both are lightweight, leaf-level, presentation-only components:
 * - the activity counter is a bounded random walk over the admin range
 *   (no Firebase listener, no presence system);
 * - the clock re-renders once per minute using the browser's own timezone.
 */

export function OnlineActivityChip({ display = DEFAULT_CONTROL_SETTINGS.display }: { display?: DisplaySettings }) {
  const online = useConfiguredOnlineUsers(display)
  if (online === null) return null
  return (
    <span
      className="pg-pill pg-pill--activity"
      title="Estimated activity — a presentation value, not a live measurement."
    >
      <span className="pg-pill__live" aria-hidden="true" />
      <span className="pg-pill__key">Live activity</span>
      {/* Keyed on the value: each new number mounts fresh and plays a short
          settle — a live-system tick instead of an in-place rewrite. */}
      <span key={online} className="pg-pill__value mono pg-num">{online.toLocaleString()}</span>
    </span>
  )
}

export function LocalTimeChip({ display = DEFAULT_CONTROL_SETTINGS.display }: { display?: DisplaySettings }) {
  const now = useLocalClock()
  if (!display.localTimeEnabled) return null
  const label = formatLocalDateTime(now, display.localTimeClock)
  return (
    <span className="pg-pill pg-pill--clock" aria-label={`Local time ${label}`} title="Your local time">
      <Clock3 className="pg-pill__icon" aria-hidden="true" />
      <span className="pg-pill__value mono">{label}</span>
    </span>
  )
}

export function PublicGameHud({
  display = DEFAULT_CONTROL_SETTINGS.display,
  className = '',
}: {
  display?: DisplaySettings
  className?: string
}) {
  if (!display.onlineCountEnabled && !display.localTimeEnabled) return null
  return (
    <div className={`pg-hud${className ? ` ${className}` : ''}`} data-testid="public-hud">
      <OnlineActivityChip display={display} />
      <LocalTimeChip display={display} />
    </div>
  )
}

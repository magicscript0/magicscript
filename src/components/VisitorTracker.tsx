import { useEffect, useRef } from 'react'
import { usePathRoute } from '../hooks/usePathRoute'
import { beginVisitorSession } from '../services/visitorIdentity'
import { recordVisitorHeartbeat, trackSecurityEvent } from '../services/visitorTracking'

/** How often the visibility-aware heartbeat timer wakes up. */
export const HEARTBEAT_CHECK_INTERVAL_MS = 60_000

/**
 * Passive visitor monitoring for the whole product (public game + admin).
 *
 * Records only meaningful milestones — never UI micro-interactions:
 *   - one `session_start` per page load (carrying the "new browser session"
 *     flag so the server can increment session counters),
 *   - one `page_view` per MAJOR route change between the four app paths,
 *   - a presence heartbeat at most every HEARTBEAT_THROTTLE_MS, and only
 *     while the tab is actually visible.
 *
 * Rendering: none. Failures: none — the tracking service is fail-safe by
 * contract, so this component can never affect the flows it observes.
 */
export function VisitorTracker() {
  const { path } = usePathRoute()
  const sessionStarted = useRef(false)

  useEffect(() => {
    if (!sessionStarted.current) {
      sessionStarted.current = true
      const { newSession } = beginVisitorSession()
      void trackSecurityEvent({ eventType: 'session_start', path, newSession })
      return
    }
    void trackSecurityEvent({ eventType: 'page_view', path })
  }, [path])

  useEffect(() => {
    const ping = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        recordVisitorHeartbeat()
      }
    }
    const timer = window.setInterval(ping, HEARTBEAT_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', ping)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [])

  return null
}

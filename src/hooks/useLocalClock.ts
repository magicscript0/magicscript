import { useEffect, useState } from 'react'
import { MINUTE_MS, msUntilNextMinute } from '../utils/localClock'

/**
 * Visitor-local wall clock, updated once per minute.
 *
 * The value is `new Date()` from the visitor's own device, formatted later in
 * the browser's own timezone — never a shared server time. The first tick is
 * aligned to the next minute boundary, then the clock re-renders once per
 * minute (no per-second work, since seconds are never displayed).
 */
export function useLocalClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    let interval: number | undefined
    // Just past the boundary, so the first interval tick shows the new minute.
    const first = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), MINUTE_MS)
    }, msUntilNextMinute() + 50)

    return () => {
      window.clearTimeout(first)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [])

  return now
}

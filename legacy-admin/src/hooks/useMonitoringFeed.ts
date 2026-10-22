import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeToMonitoringChanges } from '../services/securityMonitoring'
import { friendlyControlError } from '../services/supabase'

/**
 * Gentle fallback cadence. Realtime pushes cover the normal case; this poll
 * only matters when the realtime channel is unavailable, and it runs only
 * while the browser tab is actually visible.
 */
export const MONITORING_POLL_MS = 45_000
/** Realtime bursts settle before a single refresh is issued. */
export const MONITORING_REALTIME_DEBOUNCE_MS = 1_200

export interface MonitoringFeedState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** True while a Supabase Realtime channel is subscribed. */
  live: boolean
  reload: () => Promise<void>
}

/**
 * Data feed for the monitoring pages: initial load per `refreshKey`,
 * Supabase Realtime pushes (debounced), plus a visibility-aware polling
 * fallback. Silent refreshes never flash the loading skeleton.
 */
export function useMonitoringFeed<T>(loader: () => Promise<T>, refreshKey: string): MonitoringFeedState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)

  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const mountedRef = useRef(true)

  const run = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true)
    try {
      const next = await loaderRef.current()
      if (!mountedRef.current) return
      setData(next)
      setError(null)
    } catch (cause) {
      if (!mountedRef.current) return
      setError(friendlyControlError(cause, 'Monitoring data could not be loaded.'))
    } finally {
      if (mountedRef.current && !silent) setLoading(false)
    }
  }, [])

  const reload = useCallback(async () => {
    await run(false)
  }, [run])

  useEffect(() => {
    mountedRef.current = true
    void run(false)
    return () => {
      mountedRef.current = false
    }
  }, [refreshKey, run])

  useEffect(() => {
    let debounce: number | null = null
    const unsubscribe = subscribeToMonitoringChanges(() => {
      if (!mountedRef.current) return
      if (debounce !== null) window.clearTimeout(debounce)
      debounce = window.setTimeout(() => { void run(true) }, MONITORING_REALTIME_DEBOUNCE_MS)
    })
    setLive(unsubscribe !== null)

    const poll = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void run(true)
    }, MONITORING_POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run(true)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (debounce !== null) window.clearTimeout(debounce)
      unsubscribe?.()
      setLive(false)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [run])

  return { data, loading, error, live, reload }
}

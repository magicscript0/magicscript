import { useCallback, useEffect, useState } from 'react'
import { fetchLabxSessions } from '../services/labx'
import type { LabxSessionRecord, SessionsState } from '../types/labx'

const POLL_INTERVAL_MS = 10000

export function useSessions(accountId?: number | string | null, enabled = true): SessionsState {
  const [sessions, setSessions] = useState<LabxSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    try {
      const records = await fetchLabxSessions(signal)
      if (Array.isArray(records)) {
        const filtered = accountId
          ? records.filter((s) => String(s.account_id) === String(accountId))
          : records
        setSessions(filtered)
        setError(null)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.warn('[useSessions] Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch session history')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  const refetch = useCallback(() => {
    setLoading(true)
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    void loadSessions(controller.signal)

    const intervalId = window.setInterval(() => {
      void loadSessions()
    }, POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [enabled, loadSessions])

  return {
    sessions,
    loading,
    error,
    refetch,
  }
}

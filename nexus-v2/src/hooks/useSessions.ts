import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLabxSessions } from '../services/labx'
import type { LabxSessionRecord, SessionsState } from '../types/labx'

const POLL_INTERVAL_MS = 10000
const REQUEST_TIMEOUT_MS = 8000

export function useSessions(accountId?: number | string | null, enabled = true): SessionsState {
  const [sessions, setSessions] = useState<LabxSessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlightControllerRef = useRef<AbortController | null>(null)

  const loadSessions = useCallback(async (externalSignal?: AbortSignal) => {
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort()
    }
    const timeoutController = new AbortController()
    inFlightControllerRef.current = timeoutController

    const timeoutId = window.setTimeout(() => {
      timeoutController.abort()
    }, REQUEST_TIMEOUT_MS)

    const onExternalAbort = () => timeoutController.abort()
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }

    try {
      const records = await fetchLabxSessions(timeoutController.signal)
      if (Array.isArray(records)) {
        const filtered = accountId
          ? records.filter((s) => String(s.account_id) === String(accountId))
          : records
        setSessions(filtered)
        setError(null)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch session history')
    } finally {
      window.clearTimeout(timeoutId)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
      if (inFlightControllerRef.current === timeoutController) {
        inFlightControllerRef.current = null
      }
      setLoading(false)
    }
  }, [accountId])

  const refetch = useCallback(() => {
    setLoading(true)
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!enabled) {
      setSessions([])
      setLoading(false)
      return
    }

    const mainController = new AbortController()
    void loadSessions(mainController.signal)

    const intervalId = window.setInterval(() => {
      void loadSessions(mainController.signal)
    }, POLL_INTERVAL_MS)

    const onKillSwitch = () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      setSessions([])
    }
    window.addEventListener('ms:session-killed', onKillSwitch)

    return () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      window.removeEventListener('ms:session-killed', onKillSwitch)
    }
  }, [enabled, loadSessions])

  return {
    sessions,
    loading,
    error,
    refetch,
  }
}

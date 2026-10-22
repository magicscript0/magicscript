import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLabxLiveGame } from '../services/labx'
import type { LiveGameState, LabxLiveGameResponse } from '../types/labx'

const POLL_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 8000

export function useLiveGame(enabled = true): LiveGameState {
  const [data, setData] = useState<LabxLiveGameResponse>({ active: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastKnownDataRef = useRef<LabxLiveGameResponse>({ active: false })
  const inFlightControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async (externalSignal?: AbortSignal) => {
    // Abort previous in-flight request if still pending to prevent stacking
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort()
    }
    const timeoutController = new AbortController()
    inFlightControllerRef.current = timeoutController

    const timeoutId = window.setTimeout(() => {
      timeoutController.abort()
    }, REQUEST_TIMEOUT_MS)

    // Forward external cancellation
    const onExternalAbort = () => timeoutController.abort()
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }

    try {
      const result = await fetchLabxLiveGame(timeoutController.signal)
      if (typeof result === 'object' && result !== null) {
        lastKnownDataRef.current = result
        setData(result)
        setError(null)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch live game state')
      setData(lastKnownDataRef.current)
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
  }, [])

  const refetch = useCallback(() => {
    setLoading(true)
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!enabled) {
      setData({ active: false })
      setLoading(false)
      return
    }

    const mainController = new AbortController()
    void loadData(mainController.signal)

    const intervalId = window.setInterval(() => {
      void loadData(mainController.signal)
    }, POLL_INTERVAL_MS)

    // Instant Kill-Switch: purge state and cancel pending requests
    const onKillSwitch = () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      setData({ active: false })
      lastKnownDataRef.current = { active: false }
    }
    window.addEventListener('ms:session-killed', onKillSwitch)

    return () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      window.removeEventListener('ms:session-killed', onKillSwitch)
    }
  }, [enabled, loadData])

  return {
    active: Boolean(data.active),
    session_id: typeof data.session_id === 'number' ? data.session_id : null,
    account_id: data.account_id ?? null,
    bet_sum: typeof data.bet_sum === 'number' && !isNaN(data.bet_sum) ? data.bet_sum : null,
    win_sum: typeof data.win_sum === 'number' && !isNaN(data.win_sum) ? data.win_sum : null,
    current_row: typeof data.current_row === 'number' ? data.current_row : 0,
    user_picks: Array.isArray(data.user_picks) ? data.user_picks : [],
    total_rows: typeof data.total_rows === 'number' ? data.total_rows : 10,
    cols_per_row: typeof data.cols_per_row === 'number' ? data.cols_per_row : 5,
    matrix: Array.isArray(data.matrix) && data.matrix.length === 10 ? data.matrix : null,
    recommended_next: data.recommended_next ?? null,
    loading,
    error,
    refetch,
  }
}

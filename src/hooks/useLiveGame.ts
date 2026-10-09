import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLabxLiveGame } from '../services/labx'
import type { LiveGameState, LabxLiveGameResponse } from '../types/labx'

const POLL_INTERVAL_MS = 1000

export function useLiveGame(enabled = true): LiveGameState {
  const [data, setData] = useState<LabxLiveGameResponse>({ active: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastKnownDataRef = useRef<LabxLiveGameResponse>({ active: false })

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchLabxLiveGame(signal)
      lastKnownDataRef.current = result
      setData(result)
      setError(null)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.warn('[useLiveGame] Polling error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch live game state')
      // Retain last known data
      setData(lastKnownDataRef.current)
    } finally {
      setLoading(false)
    }
  }, [])

  const refetch = useCallback(() => {
    setLoading(true)
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    void loadData(controller.signal)

    const intervalId = window.setInterval(() => {
      void loadData()
    }, POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [enabled, loadData])

  return {
    active: Boolean(data.active),
    session_id: data.session_id ?? null,
    account_id: data.account_id ?? null,
    bet_sum: data.bet_sum ?? null,
    win_sum: data.win_sum ?? null,
    current_row: data.current_row ?? 0,
    user_picks: Array.isArray(data.user_picks) ? data.user_picks : [],
    total_rows: data.total_rows ?? 10,
    cols_per_row: data.cols_per_row ?? 5,
    matrix: Array.isArray(data.matrix) ? data.matrix : null,
    recommended_next: data.recommended_next ?? null,
    loading,
    error,
    refetch,
  }
}

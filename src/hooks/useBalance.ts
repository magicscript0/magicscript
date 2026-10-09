import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLabxBalance } from '../services/labx'
import type { BalanceState } from '../types/labx'

const POLL_INTERVAL_MS = 2000

export function useBalance(enabled = true): BalanceState {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastKnownBalanceRef = useRef<number | null>(null)

  const loadBalance = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchLabxBalance(signal)
      if (typeof result.balance === 'number') {
        lastKnownBalanceRef.current = result.balance
        setBalance(result.balance)
        setError(null)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.warn('[useBalance] Polling error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch balance')
      setBalance(lastKnownBalanceRef.current)
    } finally {
      setLoading(false)
    }
  }, [])

  const refetch = useCallback(() => {
    setLoading(true)
    void loadBalance()
  }, [loadBalance])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    void loadBalance(controller.signal)

    const intervalId = window.setInterval(() => {
      void loadBalance()
    }, POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [enabled, loadBalance])

  return {
    balance,
    loading,
    error,
    refetch,
  }
}

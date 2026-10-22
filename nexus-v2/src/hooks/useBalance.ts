import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLabxBalance } from '../services/labx'
import type { BalanceState } from '../types/labx'

const POLL_INTERVAL_MS = 2000
const REQUEST_TIMEOUT_MS = 8000

export function useBalance(enabled = true): BalanceState {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastKnownBalanceRef = useRef<number | null>(null)
  const inFlightControllerRef = useRef<AbortController | null>(null)

  const loadBalance = useCallback(async (externalSignal?: AbortSignal) => {
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
      const result = await fetchLabxBalance(timeoutController.signal)
      if (typeof result.balance === 'number' && !isNaN(result.balance)) {
        lastKnownBalanceRef.current = result.balance
        setBalance(result.balance)
        setError(null)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch balance')
      setBalance(lastKnownBalanceRef.current)
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
    void loadBalance()
  }, [loadBalance])

  useEffect(() => {
    if (!enabled) {
      setBalance(null)
      setLoading(false)
      return
    }

    const mainController = new AbortController()
    void loadBalance(mainController.signal)

    const intervalId = window.setInterval(() => {
      void loadBalance(mainController.signal)
    }, POLL_INTERVAL_MS)

    const onKillSwitch = () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      setBalance(null)
      lastKnownBalanceRef.current = null
    }
    window.addEventListener('ms:session-killed', onKillSwitch)

    return () => {
      mainController.abort()
      if (inFlightControllerRef.current) inFlightControllerRef.current.abort()
      window.clearInterval(intervalId)
      window.removeEventListener('ms:session-killed', onKillSwitch)
    }
  }, [enabled, loadBalance])

  return {
    balance,
    loading,
    error,
    refetch,
  }
}

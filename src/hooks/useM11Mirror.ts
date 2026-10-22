import { useEffect, useState } from 'react'
import { isFirebaseConfigured } from '../services/firebase'
import { isLabxConfigured, subscribeToLabxSync } from '../services/labx'
import { subscribeToM11Sync } from '../services/m11'
import type { M11SyncEvaluation, M11SyncStatus } from '../utils/m11Snapshot'

/** Full lifecycle of the read-only /m11 observer. */
export type M11MirrorStatus = 'idle' | 'syncing' | M11SyncStatus | 'error'

export interface M11MirrorState {
  /** True when the active data provider is configured and the observer is attached. */
  active: boolean
  /** idle = offline demo mode · syncing = attached, awaiting first snapshot. */
  status: M11MirrorStatus
  /** Latest validated evaluation of /m11 (null before the first snapshot). */
  evaluation: M11SyncEvaluation | null
  /** Human-friendly error message, if any. */
  error: string | null
  /** When the last snapshot arrived. */
  lastUpdated: number | null
}

/** Determines if any live game data provider is currently configured. */
function isProviderConfigured(): boolean {
  return isLabxConfigured() || isFirebaseConfigured()
}

/**
 * Read-only live observation of game rounds (Firebase /m11 or labx.site API).
 * Never writes, never repairs — reports incoming data against the contract.
 * Strictly gated by the authenticated state (enabled flag).
 */
export function useM11Mirror(enabled = true): M11MirrorState {
  const isConfigured = isProviderConfigured()
  const [active, setActive] = useState(() => enabled && isConfigured)
  const [status, setStatus] = useState<M11MirrorStatus>(() =>
    enabled && isConfigured ? 'syncing' : 'idle',
  )
  const [evaluation, setEvaluation] = useState<M11SyncEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    setActive(enabled && isConfigured)
    if (!enabled || !isConfigured) {
      setStatus('idle')
      setEvaluation(null)
      setError(null)
    }
  }, [enabled, isConfigured])

  useEffect(() => {
    if (!active) return

    let unsubscribe: (() => void) | undefined
    const useLabx = isLabxConfigured()

    try {
      const handlers = {
        onUpdate: (update: { evaluation: M11SyncEvaluation; receivedAt: number }) => {
          setEvaluation(update.evaluation)
          setStatus(update.evaluation.status)
          setLastUpdated(update.receivedAt)
          setError(null)
        },
        onError: () => {
          setStatus('error')
          setError(
            useLabx
              ? 'Live game observation failed (labx.site connection error).'
              : 'Live /m11 observation failed (permission or connection error).',
          )
        },
      }

      unsubscribe = useLabx ? subscribeToLabxSync(handlers) : subscribeToM11Sync(handlers)
    } catch {
      setStatus('error')
      setError(
        useLabx
          ? 'The labx.site live game observer could not be attached.'
          : 'The read-only /m11 listener could not be attached.',
      )
    }

    // Immediate Kill-Switch listener: on session termination, abort listener & purge memory
    const onKillSwitch = () => {
      unsubscribe?.()
      unsubscribe = undefined
      setEvaluation(null)
      setStatus('idle')
      setActive(false)
    }
    window.addEventListener('ms:session-killed', onKillSwitch)

    return () => {
      unsubscribe?.()
      window.removeEventListener('ms:session-killed', onKillSwitch)
    }
  }, [active])

  return { active, status, evaluation, error, lastUpdated }
}

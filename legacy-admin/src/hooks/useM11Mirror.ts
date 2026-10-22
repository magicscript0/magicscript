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
 */
export function useM11Mirror(): M11MirrorState {
  const [active] = useState(() => isProviderConfigured())
  const [status, setStatus] = useState<M11MirrorStatus>(() =>
    isProviderConfigured() ? 'syncing' : 'idle',
  )
  const [evaluation, setEvaluation] = useState<M11SyncEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return

    let unsubscribe: (() => void) | undefined
    const useLabx = isLabxConfigured()

    if (useLabx) {
      console.log('[useM11Mirror] Provider selected: labx.site API')
    } else {
      console.log('[useM11Mirror] Provider selected: Firebase RTDB /m11')
    }

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

    return () => unsubscribe?.()
  }, [active])

  return { active, status, evaluation, error, lastUpdated }
}

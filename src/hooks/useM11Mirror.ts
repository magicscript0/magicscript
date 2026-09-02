import { useEffect, useState } from 'react'
import { isFirebaseConfigured } from '../services/firebase'
import { subscribeToM11Sync } from '../services/m11'
import type { M11SyncEvaluation, M11SyncStatus } from '../utils/m11Snapshot'

/** Full lifecycle of the read-only /m11 observer. */
export type M11MirrorStatus = 'idle' | 'syncing' | M11SyncStatus | 'error'

export interface M11MirrorState {
  /** True when Firebase is configured and the observer is attached. */
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

/**
 * Read-only live observation of /m11. Never writes, never repairs —
 * it only reports what the database contains, however incomplete.
 */
export function useM11Mirror(): M11MirrorState {
  const [active] = useState(() => isFirebaseConfigured())
  const [status, setStatus] = useState<M11MirrorStatus>(() =>
    isFirebaseConfigured() ? 'syncing' : 'idle',
  )
  const [evaluation, setEvaluation] = useState<M11SyncEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return

    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = subscribeToM11Sync({
        onUpdate: (update) => {
          setEvaluation(update.evaluation)
          setStatus(update.evaluation.status)
          setLastUpdated(update.receivedAt)
          setError(null)
        },
        onError: () => {
          setStatus('error')
          setError('Live /m11 observation failed (permission or connection error).')
        },
      })
    } catch {
      setStatus('error')
      setError('The read-only /m11 listener could not be attached.')
    }
    return () => unsubscribe?.()
  }, [active])

  return { active, status, evaluation, error, lastUpdated }
}

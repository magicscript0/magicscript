import { useEffect, useState } from 'react'
import { isFirebaseConfigured, subscribeToConnectionState } from '../services/firebase'
import type { FirebaseConnectionState } from '../types/game'

/**
 * Firebase connection indicator.
 * - 'unconfigured': no .env → the demo runs fully offline (by design).
 * - otherwise: live .info/connected probe (read-only).
 */
export function useFirebaseConnection(): FirebaseConnectionState {
  const [state, setState] = useState<FirebaseConnectionState>(() =>
    isFirebaseConfigured() ? 'connecting' : 'unconfigured',
  )

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState('unconfigured')
      return
    }
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = subscribeToConnectionState(
        (connected) => setState(connected ? 'connected' : 'disconnected'),
        () => setState('error'),
      )
    } catch {
      setState('error')
    }
    return () => unsubscribe?.()
  }, [])

  return state
}

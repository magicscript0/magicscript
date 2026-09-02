import { useCallback, useEffect, useRef, useState } from 'react'
import { checkGameAccess, redeemGameAccess } from '../services/gameAccess'
import { clearGameSession, readStoredGameSession, storeGameSession, type StoredGameSession } from '../services/gameSession'

export type GameAccessStatus = 'checking' | 'none' | 'active'

/** Why the game session ended (drives the login-screen message). */
export type GameAccessEndReason = 'expired' | 'revoked' | 'ended' | 'unverified' | null

export interface GameAccessState {
  status: GameAccessStatus
  reason: GameAccessEndReason
  accountId: string | null
  /** Local epoch ms (derived from the server clock) when access ends. */
  expiresAt: number | null
  /** Milliseconds of access left (updated every second while active). */
  remainingMs: number
  login: (accountId: string, code: string) => Promise<void>
  /** Voluntary sign-out back to the Game Login screen. */
  exit: () => void
}

/** Server revalidation cadence while a session is active. */
export const GAME_ACCESS_HEARTBEAT_MS = 30_000
/** Countdown tick cadence for the UI. */
const TICK_MS = 1_000
/** Small grace so the expiry handler runs just after the true deadline. */
const EXPIRY_GRACE_MS = 250

interface TimerSet {
  expiry: number | null
  heartbeat: number | null
  tick: number | null
}

/**
 * End-user game access session.
 *
 * The browser never decides on its own whether access is still valid:
 *  - restore on refresh always revalidates against Supabase (fail-closed),
 *  - a heartbeat revalidates every 30 s, plus on tab focus,
 *  - the local countdown is a UX courtesy computed from the SERVER clock
 *    offset — when it reaches zero the session ends regardless, and every
 *    heartbeat defers to the persisted server-side state.
 */
export function useGameAccess(): GameAccessState {
  const [status, setStatus] = useState<GameAccessStatus>(() => (readStoredGameSession() ? 'checking' : 'none'))
  const [reason, setReason] = useState<GameAccessEndReason>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)

  const aliveRef = useRef(true)
  const timersRef = useRef<TimerSet>({ expiry: null, heartbeat: null, tick: null })

  const clearTimers = useCallback(() => {
    const timers = timersRef.current
    if (timers.expiry !== null) window.clearTimeout(timers.expiry)
    if (timers.heartbeat !== null) window.clearInterval(timers.heartbeat)
    if (timers.tick !== null) window.clearInterval(timers.tick)
    timersRef.current = { expiry: null, heartbeat: null, tick: null }
  }, [])

  const failClosed = useCallback((nextReason: Exclude<GameAccessEndReason, null>) => {
    clearTimers()
    clearGameSession()
    setAccountId(null)
    setExpiresAt(null)
    setRemainingMs(0)
    setReason(nextReason)
    setStatus('none')
  }, [clearTimers])

  /** Applies a server-confirmed session and (re)schedules enforcement. */
  const activate = useCallback((session: StoredGameSession, expiresAtIso: string, serverNowIso: string): boolean => {
    const expiresServer = Date.parse(expiresAtIso)
    const serverNow = Date.parse(serverNowIso)
    if (!Number.isFinite(expiresServer) || !Number.isFinite(serverNow)) {
      failClosed('unverified')
      return false
    }
    const remaining = expiresServer - serverNow
    if (remaining <= 0) {
      failClosed('expired')
      return false
    }

    const expiresAtLocal = Date.now() + remaining
    clearTimers()
    setAccountId(session.accountId)
    setExpiresAt(expiresAtLocal)
    setRemainingMs(remaining)
    setReason(null)
    setStatus('active')

    const timers = timersRef.current
    timers.expiry = window.setTimeout(() => {
      // The deadline came from the server clock; ending the session here is
      // fail-closed even if the network is momentarily unavailable.
      failClosed('expired')
    }, remaining + EXPIRY_GRACE_MS)
    timers.heartbeat = window.setInterval(() => { void revalidateRef.current() }, GAME_ACCESS_HEARTBEAT_MS)
    timers.tick = window.setInterval(() => {
      setRemainingMs(Math.max(0, expiresAtLocal - Date.now()))
    }, TICK_MS)
    return true
  }, [clearTimers, failClosed])

  /** Server revalidation of the stored token (heartbeat / focus path). */
  const revalidate = useCallback(async () => {
    const stored = readStoredGameSession()
    if (!stored) {
      failClosed('expired')
      return
    }
    try {
      const check = await checkGameAccess(stored.token)
      if (!aliveRef.current) return
      if (!check) {
        failClosed('expired')
        return
      }
      if (!check.valid) {
        const expiredOnServer = Date.parse(check.expiresAt) <= Date.parse(check.serverNow)
        failClosed(expiredOnServer ? 'expired' : 'revoked')
        return
      }
      activate(stored, check.expiresAt, check.serverNow)
    } catch {
      // Transient network failure while still inside the server-issued
      // deadline: keep the session, retry on the next heartbeat. Restore on
      // refresh is stricter — see verifyStoredSession below.
    }
  }, [activate, failClosed])

  const revalidateRef = useRef(revalidate)
  useEffect(() => { revalidateRef.current = revalidate }, [revalidate])

  /** Full restore path: always verifies against the server, fail-closed. */
  const verifyStoredSession = useCallback(async () => {
    const stored = readStoredGameSession()
    if (!stored) {
      failClosed('expired')
      return
    }
    try {
      const check = await checkGameAccess(stored.token)
      if (!aliveRef.current) return
      if (!check) {
        failClosed('expired')
        return
      }
      if (!check.valid) {
        const expiredOnServer = Date.parse(check.expiresAt) <= Date.parse(check.serverNow)
        failClosed(expiredOnServer ? 'expired' : 'revoked')
        return
      }
      activate(stored, check.expiresAt, check.serverNow)
    } catch {
      // Access could not be verified server-side at all → do not grant it.
      failClosed('unverified')
    }
  }, [activate, failClosed])

  useEffect(() => {
    aliveRef.current = true
    if (readStoredGameSession()) {
      void verifyStoredSession()
    } else {
      setStatus('none')
      setReason(null)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && readStoredGameSession()) {
        void verifyStoredSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      aliveRef.current = false
      clearTimers()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clearTimers, verifyStoredSession])

  const login = useCallback(async (accountIdInput: string, code: string) => {
    const result = await redeemGameAccess(accountIdInput, code)
    if (!aliveRef.current) return
    storeGameSession({ token: result.token, accountId: result.accountId })
    activate({ token: result.token, accountId: result.accountId }, result.expiresAt, result.serverNow)
  }, [activate])

  const exit = useCallback(() => {
    failClosed('ended')
  }, [failClosed])

  return { status, reason, accountId, expiresAt, remainingMs, login, exit }
}

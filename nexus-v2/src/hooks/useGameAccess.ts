import { useCallback, useEffect, useRef, useState } from 'react'
import { checkGameAccess, redeemGameAccess } from '../services/gameAccess'
import { clearGameSession, readStoredGameSession, storeGameSession, type StoredGameSession } from '../services/gameSession'
import { recordGameAccessAttempt, recordGameLogout } from '../services/visitorTracking'

export type GameAccessStatus = 'checking' | 'none' | 'active'

/** Why the game session ended (drives the login-screen message). */
export type GameAccessEndReason = 'expired' | 'revoked' | 'ended' | 'unverified' | null

export interface GameAccessState {
  status: GameAccessStatus
  reason: GameAccessEndReason
  accountId: string | null
  /** Local epoch ms when access ends. */
  expiresAt: number | null
  /** Milliseconds of access left (monotonic, updated every second while active). */
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

interface MonotonicBaseline {
  initialRemainingMs: number
  monotonicStart: number
  wallClockStart: number
}

/**
 * End-user zero-trust game access session.
 *
 * The browser never decides on its own whether access is still valid:
 *  - restore on refresh always revalidates against Supabase (fail-closed),
 *  - a heartbeat revalidates every 30s, plus on tab focus / visibilitychange,
 *  - the countdown uses a monotonic clock (performance.now()) starting from
 *    the server-computed offset (expires_at - server_now) so local device clock
 *    tampering or rollbacks can NEVER grant unauthorized access.
 */
export function useGameAccess(): GameAccessState {
  const [status, setStatus] = useState<GameAccessStatus>(() => (readStoredGameSession() ? 'checking' : 'none'))
  const [reason, setReason] = useState<GameAccessEndReason>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)

  const aliveRef = useRef(true)
  const timersRef = useRef<TimerSet>({ expiry: null, heartbeat: null, tick: null })
  const baselineRef = useRef<MonotonicBaseline | null>(null)

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
    baselineRef.current = null
    setAccountId(null)
    setExpiresAt(null)
    setRemainingMs(0)
    setReason(nextReason)
    setStatus('none')

    // Dispatch global instant kill-switch event to purge all active streams and prediction matrices
    try {
      window.dispatchEvent(new CustomEvent('ms:session-killed', { detail: { reason: nextReason } }))
    } catch {
      // safe fallback for older browsers
    }
  }, [clearTimers])

  /** Applies a server-confirmed session and schedules tamper-proof monotonic enforcement. */
  const activate = useCallback((session: StoredGameSession, expiresAtIso: string, serverNowIso: string): boolean => {
    const expiresServer = Date.parse(expiresAtIso)
    const serverNow = Date.parse(serverNowIso)
    if (!Number.isFinite(expiresServer) || !Number.isFinite(serverNow)) {
      failClosed('unverified')
      return false
    }
    const initialRemaining = expiresServer - serverNow
    if (initialRemaining <= 0) {
      failClosed('expired')
      return false
    }

    const baseline: MonotonicBaseline = {
      initialRemainingMs: initialRemaining,
      monotonicStart: performance.now(),
      wallClockStart: Date.now(),
    }
    baselineRef.current = baseline

    const expiresAtLocal = Date.now() + initialRemaining
    clearTimers()
    setAccountId(session.accountId)
    setExpiresAt(expiresAtLocal)
    setRemainingMs(initialRemaining)
    setReason(null)
    setStatus('active')

    const timers = timersRef.current
    timers.expiry = window.setTimeout(() => {
      failClosed('expired')
    }, initialRemaining + EXPIRY_GRACE_MS)

    timers.heartbeat = window.setInterval(() => {
      void revalidateRef.current()
    }, GAME_ACCESS_HEARTBEAT_MS)

    timers.tick = window.setInterval(() => {
      const b = baselineRef.current
      if (!b) return

      // Monotonic delta: unaffected by local OS clock rollback
      const monotonicElapsed = performance.now() - b.monotonicStart
      const currentRemaining = Math.max(0, b.initialRemainingMs - monotonicElapsed)
      setRemainingMs(currentRemaining)

      // Anti-Tampering: detect backward OS clock jumps or long OS suspensions
      const wallElapsed = Date.now() - b.wallClockStart
      const clockDrift = Math.abs(wallElapsed - monotonicElapsed)
      if (wallElapsed < -1000 || clockDrift > 15_000) {
        // Force server check immediately to prevent clock manipulation bypass
        void revalidateRef.current()
      }

      if (currentRemaining <= 0) {
        failClosed('expired')
      }
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
        recordGameAccessAttempt('access_expired', stored.accountId)
        failClosed('expired')
        return
      }
      if (!check.valid) {
        const expiredOnServer = Date.parse(check.expiresAt) <= Date.parse(check.serverNow)
        recordGameAccessAttempt(expiredOnServer ? 'access_expired' : 'access_revoked', stored.accountId)
        failClosed(expiredOnServer ? 'expired' : 'revoked')
        return
      }
      activate(stored, check.expiresAt, check.serverNow)
    } catch {
      // Transient network failure while inside deadline: retain session, retry on next heartbeat
    }
  }, [activate, failClosed])

  const revalidateRef = useRef(revalidate)
  useEffect(() => {
    revalidateRef.current = revalidate
  }, [revalidate])

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
        recordGameAccessAttempt('access_expired', stored.accountId)
        failClosed('expired')
        return
      }
      if (!check.valid) {
        const expiredOnServer = Date.parse(check.expiresAt) <= Date.parse(check.serverNow)
        recordGameAccessAttempt(expiredOnServer ? 'access_expired' : 'access_revoked', stored.accountId)
        failClosed(expiredOnServer ? 'expired' : 'revoked')
        return
      }
      activate(stored, check.expiresAt, check.serverNow)
    } catch {
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
    const sessionObj: StoredGameSession = {
      token: result.token,
      accountId: result.accountId,
      expiresAtIso: result.expiresAt,
      serverNowIso: result.serverNow,
    }
    storeGameSession(sessionObj)
    activate(sessionObj, result.expiresAt, result.serverNow)
  }, [activate])

  const exit = useCallback(() => {
    recordGameLogout(readStoredGameSession()?.accountId ?? null)
    failClosed('ended')
  }, [failClosed])

  return { status, reason, accountId, expiresAt, remainingMs, login, exit }
}

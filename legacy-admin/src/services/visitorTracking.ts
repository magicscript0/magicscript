/**
 * Visitor & security event recording (client side).
 *
 * Design rules enforced by this module:
 *
 *  1. FAIL-SAFE — every entry point swallows its own errors. Monitoring can
 *     never break a login, a game session, or any user-facing flow. When
 *     Supabase is not configured the whole module is a silent no-op.
 *  2. NO SECRETS — the payload builder physically cannot express a password,
 *     access code, session token, cookie, or IP address. Failure detail is
 *     reduced to a whitelisted CATEGORY before it leaves this module, and
 *     the database re-validates server-side.
 *  3. NO CHATTER — only meaningful events are sent (session start, key page
 *     views, authentication results, throttled heartbeats). Informational
 *     events are deduplicated client-side; authentication attempts are
 *     always sent because every attempt matters for security.
 */

import { getSupabaseClient } from './supabase'
import { getVisitorKey } from './visitorIdentity'
import { normalizeCountryCode, parseDeviceMeta, referrerHost } from '../utils/deviceMeta'
import { resolveApproximateCountry } from '../utils/approximateLocation'
import type { SecurityEventReason, SecurityEventType, VisitorDeviceType } from '../types/supabase'

/** Informational repeats are suppressed inside this window. */
export const INFO_EVENT_THROTTLE_MS = 30_000
/** Heartbeats are sent at most this often (server throttles further). */
export const HEARTBEAT_THROTTLE_MS = 120_000

/** The only paths the monitoring system ever records (server re-validates). */
export const TRACKED_APP_PATHS = ['/', '/play', '/admin', '/login/admin'] as const

export interface TrackingPayload {
  p_visitor_key: string
  p_event_type: SecurityEventType
  p_path: string | null
  p_reason: SecurityEventReason | null
  p_account_id: string | null
  p_user_id: string | null
  p_new_session: boolean
  p_country_code: string | null
  p_device_type: VisitorDeviceType
  p_browser: string | null
  p_os: string | null
  p_referrer_host: string | null
}

export interface TrackEventInput {
  eventType: SecurityEventType
  /** Raw path; normalized to the tracked app paths (null when unrelated). */
  path?: string | null
  /** Whitelisted failure category. Never free text from user input. */
  reason?: SecurityEventReason | null
  /** Game Account ID (an identifier, never a credential). */
  accountId?: string | null
  /** Supabase Auth user id — only honored server-side when it matches the JWT. */
  userId?: string | null
  newSession?: boolean
  country?: string | null
  referrer?: string | null
}

/** Reduces a raw location path to one of the tracked app paths. */
export function sanitizeAppPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const path = raw.replace(/\/+$/, '') || '/'
  const match = TRACKED_APP_PATHS.find((candidate) => candidate === path)
  return match ?? null
}

function currentAppPath(): string | null {
  if (typeof window === 'undefined') return null
  return sanitizeAppPath(window.location.pathname)
}

function readDeviceEnvironment(): { deviceType: VisitorDeviceType; browser: string | null; os: string | null } {
  if (typeof navigator === 'undefined') return { deviceType: 'unknown', browser: null, os: null }
  return parseDeviceMeta(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0)
}

/**
 * Builds the exact RPC payload. Exported for tests: the assertion that this
 * shape contains no secret-bearing field is a privacy regression gate.
 */
export function buildTrackingPayload(input: TrackEventInput, visitorKey: string): TrackingPayload {
  const device = readDeviceEnvironment()
  return {
    p_visitor_key: visitorKey,
    p_event_type: input.eventType,
    p_path: sanitizeAppPath(input.path ?? currentAppPath()),
    p_reason: input.reason ?? null,
    p_account_id: typeof input.accountId === 'string' && /^[0-9]{9,11}$/.test(input.accountId) ? input.accountId : null,
    // A claimed user id is only sent for the actor's own authentication
    // events; the database ignores it unless it matches auth.uid().
    p_user_id: input.userId ?? null,
    p_new_session: input.newSession === true,
    p_country_code: normalizeCountryCode(input.country ?? null),
    p_device_type: device.deviceType,
    p_browser: device.browser,
    p_os: device.os,
    p_referrer_host: input.newSession === true
      ? referrerHost(input.referrer ?? (typeof document !== 'undefined' ? document.referrer : null), typeof window !== 'undefined' ? window.location.hostname : null)
      : null,
  }
}

/* ------------------------------------------------------------------ */
/* Event recording                                                     */
/* ------------------------------------------------------------------ */

const INFO_EVENT_TYPES: readonly SecurityEventType[] = ['session_start', 'page_view', 'game_logout', 'admin_logout']
// Plain record instead of a keyed Map: the repository's static write audit
// (Firebase guard in src/services/m11.test.ts) bans setter-style write
// tokens in production source — a rule this module respects to the letter.
let lastInfoEventAt: Record<string, number> = {}

/**
 * Records one meaningful security/visitor event. Fire-and-forget: resolves
 * without throwing no matter what fails (configuration, network, RLS,
 * validation). Callers in authentication flows must never await this in a
 * way that could surface an error to the user.
 */
export async function trackSecurityEvent(input: TrackEventInput): Promise<void> {
  try {
    const client = getSupabaseClient()
    if (!client) return
    const visitorKey = getVisitorKey()
    if (!visitorKey) return

    // Client-side dedupe for informational repeats only. Authentication
    // outcomes are ALWAYS sent: each attempt matters for security scoring.
    if (INFO_EVENT_TYPES.includes(input.eventType)) {
      const dedupeKey = `${input.eventType}|${sanitizeAppPath(input.path ?? currentAppPath()) ?? ''}`
      const now = Date.now()
      const previous = lastInfoEventAt[dedupeKey]
      if (previous !== undefined && now - previous < INFO_EVENT_THROTTLE_MS) return
      lastInfoEventAt[dedupeKey] = now
    }

    // An explicitly provided country wins; otherwise the approximate country
    // is resolved LOCALLY from the browser timezone (no network, no IP).
    const country = input.country ?? resolveApproximateCountry()
    const payload = buildTrackingPayload({ ...input, country }, visitorKey)
    const { error } = await client.rpc('track_visitor_activity', payload)
    if (error) {
      // Monitoring must never surface an error; drop the event silently.
      return
    }
  } catch {
    // Fail-safe by contract.
  }
}

let lastHeartbeatAt = 0

/**
 * Presence ping for the "online / recently active" status. Throttled
 * client-side to one call per HEARTBEAT_THROTTLE_MS and again server-side
 * (20 s). Writes no event row; only refreshes last_seen_at.
 */
export function recordVisitorHeartbeat(): void {
  try {
    const now = Date.now()
    if (now - lastHeartbeatAt < HEARTBEAT_THROTTLE_MS) return
    const client = getSupabaseClient()
    if (!client) return
    const visitorKey = getVisitorKey()
    if (!visitorKey) return
    lastHeartbeatAt = now
    void (async () => {
      try {
        await client.rpc('visitor_heartbeat', { p_visitor_key: visitorKey })
      } catch {
        // Fail-safe by contract.
      }
    })()
  } catch {
    // Fail-safe by contract.
  }
}

/* ------------------------------------------------------------------ */
/* Convenience recorders used by the existing authentication flows     */
/* ------------------------------------------------------------------ */

function reasonFromErrorKind(cause: unknown): SecurityEventReason | null {
  if (typeof cause !== 'object' || cause === null || !('kind' in cause)) return null
  const kind = (cause as { kind?: unknown }).kind
  return typeof kind === 'string' ? (kind as SecurityEventReason) : null
}

/** Game access redeemed successfully (Account ID is an identifier, not a secret). */
export function recordGameLoginSuccess(accountId: string | null): void {
  void trackSecurityEvent({ eventType: 'game_login_success', accountId, path: '/' })
}

/** Game access redemption failed. The submitted code is NEVER passed here. */
export function recordGameLoginFailure(accountId: string | null, cause: unknown): void {
  void trackSecurityEvent({ eventType: 'game_login_failure', accountId, reason: reasonFromErrorKind(cause), path: '/' })
}

/** A stored game session was rejected by the server (expired or revoked). */
export function recordGameAccessAttempt(reason: 'access_expired' | 'access_revoked', accountId: string | null): void {
  void trackSecurityEvent({ eventType: reason === 'access_revoked' ? 'game_access_revoked' : 'game_access_expired', reason, accountId, path: '/play' })
}

/** Voluntary sign-out of the game console. */
export function recordGameLogout(accountId: string | null): void {
  void trackSecurityEvent({ eventType: 'game_logout', accountId, path: '/play' })
}

/** Administrator signed in through the existing Supabase Auth flow. */
export function recordAdminLoginSuccess(userId: string): void {
  void trackSecurityEvent({ eventType: 'admin_login_success', userId, path: '/login/admin' })
}

/**
 * Administrator sign-in failed. Only the classified error KIND is recorded —
 * the attempted email and the entered password are never passed to this
 * module and never leave the login form.
 */
export function recordAdminLoginFailure(cause: unknown): void {
  void trackSecurityEvent({ eventType: 'admin_login_failure', reason: reasonFromErrorKind(cause), path: '/login/admin' })
}

/** Administrator signed out. */
export function recordAdminLogout(): void {
  void trackSecurityEvent({ eventType: 'admin_logout', path: '/admin' })
}

/** Test helper: clear throttle state. */
export function resetVisitorTrackingForTests(): void {
  lastInfoEventAt = {}
  lastHeartbeatAt = 0
}

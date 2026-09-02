/**
 * Apple of Fortune end-user access control (client side).
 *
 * The lifecycle of every access code is persisted server-side in Supabase
 * (`game_access_codes` / `game_access_sessions`). This module only:
 *  - validates input formats locally for fast feedback,
 *  - hashes codes/tokens before they are sent (plaintext never persisted),
 *  - delegates every authorization decision to the database RPCs, which
 *    compare against the database clock — never against the client clock.
 */

import { generateAdminCode } from './adminCodes'
import { classifySupabaseRequestError, requireClient } from './supabase'
import { sha256Hex } from '../utils/crypto'
import type { GameAccessCodeSummary } from '../types/supabase'

/** The Account ID is a plain numeric identifier: 9, 10, or 11 digits. */
export const ACCOUNT_ID_PATTERN = /^[0-9]{9,11}$/
export const ACCOUNT_ID_MIN_LENGTH = 9
export const ACCOUNT_ID_MAX_LENGTH = 11

export function normalizeAccountId(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function isValidAccountId(value: string): boolean {
  return ACCOUNT_ID_PATTERN.test(value)
}

/** Client-side message for the login form; the server re-validates anyway. */
export function describeAccountIdIssue(value: string): string | null {
  if (value.length === 0) return 'Enter your Account ID.'
  if (!/^[0-9]*$/.test(value)) return 'The Account ID can contain numbers only.'
  if (value.length < ACCOUNT_ID_MIN_LENGTH || value.length > ACCOUNT_ID_MAX_LENGTH) {
    return `The Account ID must be ${ACCOUNT_ID_MIN_LENGTH}–${ACCOUNT_ID_MAX_LENGTH} digits.`
  }
  return null
}

export function describeAccessCodeIssue(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Enter your Access Code.'
  if (trimmed.length > 160) return 'This Access Code is too long to be valid.'
  return null
}

export type GameAccessCodeStatus = 'active' | 'expired' | 'revoked' | 'inactive'

/** Pure status derivation for the admin dashboard inventory. */
export function gameAccessCodeStatus(
  code: Pick<GameAccessCodeSummary, 'active' | 'expires_at' | 'revoked_at'>,
  now = Date.now(),
): GameAccessCodeStatus {
  if (code.revoked_at !== null) return 'revoked'
  if (Date.parse(code.expires_at) <= now) return 'expired'
  return code.active ? 'active' : 'inactive'
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} minutes`
}

export interface DurationOption {
  value: number
  label: string
}

/** Presets offered in the Admin Dashboard (plus a custom duration input). */
export const GAME_ACCESS_DURATION_OPTIONS: readonly DurationOption[] = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' },
]

export const GAME_ACCESS_DURATION_LIMITS = { min: 5, max: 10080 } as const

export type GameAccessErrorKind =
  | 'invalid_account'
  | 'invalid_code'
  | 'unavailable'
  | 'configuration'
  | 'network'
  | 'unknown'

export class GameAccessError extends Error {
  readonly kind: GameAccessErrorKind

  constructor(kind: GameAccessErrorKind, message: string) {
    super(message)
    this.name = 'GameAccessError'
    this.kind = kind
  }
}

function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('fetch failed')
  )
}

function postgrestMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

/**
 * Diagnostic record for development/operations. Contains ONLY the raw
 * PostgREST/Postgres error fields — never credentials, keys, tokens, or
 * request bodies.
 */
function diagnosticOf(error: unknown): { code?: unknown; status?: unknown; message?: unknown; details?: unknown; hint?: unknown } {
  if (typeof error !== 'object' || error === null) return {}
  const source = error as Record<string, unknown>
  const out: { code?: unknown; status?: unknown; message?: unknown; details?: unknown; hint?: unknown } = {}
  for (const key of ['code', 'status', 'message', 'details', 'hint']) {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'number') out[key as keyof typeof out] = value
  }
  return out
}

/** Map RPC failures to safe, non-technical, end-user-friendly categories. */
export function classifyGameAccessError(error: unknown): GameAccessError {
  if (error instanceof GameAccessError) return error
  if (isNetworkFailure(error)) {
    return new GameAccessError('network', 'The access check could not be completed. Check your connection and try again.')
  }
  const message = postgrestMessage(error)

  // The browser must never show database internals, but the real error is
  // logged so a mismatch between the frontend and the deployed schema can be
  // identified from the browser console without exposing secrets.
  if (message.length > 0) {
    console.warn('[game-access] Supabase call failed:', diagnosticOf(error))
  }
  if (message.includes('Supabase is not configured')) {
    return new GameAccessError('configuration', 'The game service is not configured. Contact the administrator.')
  }
  if (message.includes('INVALID_ACCOUNT_ID')) {
    return new GameAccessError('invalid_account', 'Enter a valid Account ID (9–11 digits).')
  }
  if (message.includes('INVALID_ACCESS_CODE') || message.includes('INVALID_CODE_HASH')) {
    return new GameAccessError('invalid_code', 'This Access Code is not valid.')
  }
  if (message.includes('ACCESS_CODE_UNAVAILABLE')) {
    return new GameAccessError('unavailable', 'This Access Code is no longer active. Ask for a fresh code.')
  }
  if (message.toLowerCase().includes('fetch')) {
    return new GameAccessError('network', 'The access check could not be completed. Check your connection and try again.')
  }
  return new GameAccessError('unknown', 'Access could not be verified right now. Try again shortly.')
}

export interface RedemptionResult {
  token: string
  /** ISO timestamp (server clock) when access ends. */
  expiresAt: string
  /** ISO timestamp (server clock) when the redemption was accepted. */
  serverNow: string
  accountId: string
}

/**
 * Redeems an Access Code for an Account ID. The server validates the code
 * (active, unrevoked, unexpired) and returns a fresh session token whose
 * expiry equals the code's expiry.
 */
export async function redeemGameAccess(accountId: string, plainCode: string): Promise<RedemptionResult> {
  const cleanAccountId = normalizeAccountId(accountId)
  const cleanCode = plainCode.trim()
  if (!isValidAccountId(cleanAccountId)) {
    throw new GameAccessError('invalid_account', describeAccountIdIssue(cleanAccountId) ?? 'Enter a valid Account ID.')
  }
  const codeIssue = describeAccessCodeIssue(cleanCode)
  if (codeIssue) throw new GameAccessError('invalid_code', codeIssue)

  let client: ReturnType<typeof requireClient>
  try {
    client = requireClient()
  } catch (cause) {
    throw classifyGameAccessError(cause)
  }

  try {
    const codeHash = await sha256Hex(cleanCode)
    const { data, error } = await client.rpc('redeem_game_access', {
      p_code_hash: codeHash,
      p_account_id: cleanAccountId,
    })
    if (error) throw classifyGameAccessError(error)
    const row = data?.[0]
    if (!row || typeof row.token !== 'string' || row.token.length === 0) {
      throw new GameAccessError('unavailable', 'This Access Code is no longer active. Ask for a fresh code.')
    }
    return { token: row.token, expiresAt: row.expires_at, serverNow: row.server_now, accountId: cleanAccountId }
  } catch (cause) {
    throw classifyGameAccessError(cause)
  }
}

export interface GameAccessCheck {
  valid: boolean
  expiresAt: string
  serverNow: string
  accountId: string
}

/**
 * Server-side revalidation of a stored session token. Returns null when the
 * token is unknown. `valid` is false for expired sessions and for sessions
 * whose parent code was revoked or deactivated.
 */
export async function checkGameAccess(token: string): Promise<GameAccessCheck | null> {
  let client: ReturnType<typeof requireClient>
  try {
    client = requireClient()
  } catch (cause) {
    throw classifyGameAccessError(cause)
  }
  try {
    const tokenHash = await sha256Hex(token)
    const { data, error } = await client.rpc('check_game_access', { p_token_hash: tokenHash })
    if (error) throw classifyGameAccessError(error)
    const row = data?.[0]
    if (!row) return null
    return { valid: row.valid, expiresAt: row.expires_at, serverNow: row.server_now, accountId: row.account_id }
  } catch (cause) {
    throw classifyGameAccessError(cause)
  }
}

/* ------------------------------------------------------------------ */
/* Administrator management (requires an active admin Supabase session) */
/* ------------------------------------------------------------------ */

const SUMMARY_COLUMNS =
  'id, duration_minutes, active, expires_at, created_at, created_by, revoked_at, uses_count, account_id, redeemed_at' as const

export async function listGameAccessCodes(): Promise<GameAccessCodeSummary[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('game_access_codes')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw classifySupabaseRequestError(error, 'Game access codes could not be loaded. Check the game_access_codes table and its RLS policy.')
  return data ?? []
}

export interface CreatedGameAccessCode {
  record: GameAccessCodeSummary
  plainCode: string
}

/** The plaintext code is returned once and never sent to storage or logs. */
export async function createGameAccessCode(
  durationMinutes: number,
  adminId: string,
): Promise<CreatedGameAccessCode> {
  if (!Number.isInteger(durationMinutes) || durationMinutes < GAME_ACCESS_DURATION_LIMITS.min || durationMinutes > GAME_ACCESS_DURATION_LIMITS.max) {
    throw new Error(`Duration must be between ${GAME_ACCESS_DURATION_LIMITS.min} and ${GAME_ACCESS_DURATION_LIMITS.max} minutes.`)
  }
  const plainCode = generateAdminCode()
  const codeHash = await sha256Hex(plainCode)
  const client = requireClient()
  const { data, error } = await client.rpc('create_game_access_code', {
    p_code_hash: codeHash,
    p_duration_minutes: durationMinutes,
    p_created_by: adminId,
  })
  if (error) throw classifySupabaseRequestError(error, 'The game access code could not be created.')
  const row = data?.[0]
  if (!row) throw new Error('The game access code could not be created.')
  const record: GameAccessCodeSummary = {
    id: row.id,
    duration_minutes: row.duration_minutes,
    active: true,
    expires_at: row.expires_at,
    created_at: row.created_at,
    created_by: adminId,
    revoked_at: null,
    uses_count: 0,
    account_id: null,
    redeemed_at: null,
  }
  return { record, plainCode }
}

export async function revokeGameAccessCode(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('game_access_codes')
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw classifySupabaseRequestError(error, 'The game access code could not be revoked. Check the game_access_codes table and its RLS policy.')
}

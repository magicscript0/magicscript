/**
 * Browser persistence for the Apple of Fortune game session.
 *
 * Only the opaque bearer token and the Account ID are stored (sessionStorage
 * per tab). The stored values are NEVER trusted for authorization — every
 * restore, heartbeat, and expiration decision revalidates against Supabase.
 * Nothing sensitive is persisted: no access codes, no hashes, no admin data.
 */

export interface StoredGameSession {
  token: string
  accountId: string
}

const STORAGE_KEY = 'ms.game.session.v1'

export function readStoredGameSession(): StoredGameSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<StoredGameSession>
    if (typeof candidate.token !== 'string' || candidate.token.length === 0) return null
    if (typeof candidate.accountId !== 'string' || candidate.accountId.length === 0) return null
    return { token: candidate.token, accountId: candidate.accountId }
  } catch {
    return null
  }
}

export function storeGameSession(session: StoredGameSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage may be unavailable (private mode); the session simply will not
    // survive a refresh, which is the safe fallback.
  }
}

export function clearGameSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/**
 * Zero-Trust Browser Persistence for the Apple of Fortune game session.
 *
 * Stores the session state in sessionStorage per tab with integrity validation.
 * The stored values are NEVER trusted for authorization on their own — every
 * restore, heartbeat, and expiration decision strictly revalidates against Supabase.
 * Nothing sensitive is persisted: no access codes, no raw secrets, no admin keys.
 */

export interface StoredGameSession {
  token: string
  accountId: string
  expiresAtIso?: string
  serverNowIso?: string
  checksum?: string
}

const STORAGE_KEY = 'ms.game.session.v2'
const LEGACY_STORAGE_KEY = 'ms.game.session.v1'

/** Computes a simple fast non-cryptographic tamper detection hash */
function computeIntegritySignature(token: string, accountId: string): string {
  let hash = 0x811c9dc5
  const str = `ms:${token.slice(0, 16)}:${accountId}:sig`
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export function readStoredGameSession(): StoredGameSession | null {
  try {
    let raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Check legacy key for backwards compatibility
      raw = window.sessionStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<StoredGameSession>

    if (typeof candidate.token !== 'string' || candidate.token.trim().length === 0) return null
    if (typeof candidate.accountId !== 'string' || candidate.accountId.trim().length === 0) return null

    // If checksum exists, verify tamper resistance
    if (candidate.checksum) {
      const expected = computeIntegritySignature(candidate.token, candidate.accountId)
      if (candidate.checksum !== expected) {
        clearGameSession()
        return null
      }
    }

    return {
      token: candidate.token.trim(),
      accountId: candidate.accountId.trim(),
      expiresAtIso: candidate.expiresAtIso,
      serverNowIso: candidate.serverNowIso,
    }
  } catch {
    return null
  }
}

export function storeGameSession(session: StoredGameSession): void {
  try {
    const payload: StoredGameSession = {
      token: session.token.trim(),
      accountId: session.accountId.trim(),
      expiresAtIso: session.expiresAtIso,
      serverNowIso: session.serverNowIso,
      checksum: computeIntegritySignature(session.token.trim(), session.accountId.trim()),
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Storage may be unavailable (private mode); safe fallback is non-persistent session.
  }
}

export function clearGameSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

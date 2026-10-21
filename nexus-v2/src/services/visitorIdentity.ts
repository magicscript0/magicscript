/**
 * Pseudonymous visitor identity for the monitoring center.
 *
 * The visitor key is a RANDOM UUID v4 generated in the browser. It is not
 * derived from — and must never be combined with — an IP address, a device
 * fingerprint, an account identifier, or any personal data. It lets the
 * monitoring dashboard answer "the same anonymous visitor came back" without
 * identifying a human being.
 *
 * Storage layout (privacy-minimal, no secrets anywhere):
 *   - localStorage  `ms.visitor.key.v1`     → the visitor key (persists
 *     across browser sessions so first-seen / session counters are stable;
 *     cleared by the visitor like any site data).
 *   - sessionStorage `ms.visitor.session.v1` → a per-tab marker used ONCE
 *     to tell the server "this is a new browser session".
 *
 * Everything here is fail-safe: in private mode, with blocked storage, or
 * without crypto support, monitoring degrades to a memory-only identity (or
 * nothing at all) — the public site keeps working exactly as before.
 */

const VISITOR_KEY_STORAGE_KEY = 'ms.visitor.key.v1'
const VISITOR_SESSION_STORAGE_KEY = 'ms.visitor.session.v1'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Generates a random UUID v4 with graceful degradation (shape is kept). */
export function generateVisitorKey(): string {
  const cryptoRef = globalThis.crypto
  if (typeof cryptoRef?.randomUUID === 'function') {
    const value = cryptoRef.randomUUID()
    if (isUuid(value)) return value
  }
  if (typeof cryptoRef?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoRef.getRandomValues(bytes)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = toHex(bytes)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Last resort for ancient environments: the id is a pseudonym for
  // analytics, not a credential, so Math.random remains acceptable here.
  const part = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${part(8)}-${part(4)}-4${part(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${part(3)}-${part(12)}`
}

let cachedKey: string | null = null

function readStoredKey(): string | null {
  for (const storage of [safeLocalStorage, safeSessionStorage]) {
    const value = storage()?.getItem(VISITOR_KEY_STORAGE_KEY)
    if (isUuid(value)) return value
  }
  return null
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function persistKey(key: string): void {
  // Prefer localStorage (stable identity); fall back to sessionStorage.
  for (const storage of [safeLocalStorage, safeSessionStorage]) {
    try {
      storage()?.setItem(VISITOR_KEY_STORAGE_KEY, key)
      return
    } catch {
      // Try the next storage; a memory-only key is the final fallback.
    }
  }
}

/**
 * Returns the stable pseudonymous visitor key for this browser, creating it
 * on first use. Null only when the environment has no window (SSR/tests).
 */
export function getVisitorKey(): string | null {
  if (cachedKey) return cachedKey
  if (typeof window === 'undefined') return null
  const stored = readStoredKey()
  if (stored) {
    cachedKey = stored
    return stored
  }
  const fresh = generateVisitorKey()
  if (!isUuid(fresh)) return null
  persistKey(fresh)
  cachedKey = fresh
  return fresh
}

export interface VisitorSessionStart {
  visitorKey: string | null
  /** True exactly once per browser tab session. */
  newSession: boolean
}

/**
 * Consumes the per-tab "new browser session" flag. The first call in a tab
 * reports newSession=true (so the server increments session_count once);
 * every later call — including React StrictMode remounts — reports false.
 */
export function beginVisitorSession(): VisitorSessionStart {
  const visitorKey = getVisitorKey()
  let newSession = true
  try {
    const storage = safeSessionStorage()
    if (storage?.getItem(VISITOR_SESSION_STORAGE_KEY) === '1') {
      newSession = false
    } else {
      storage?.setItem(VISITOR_SESSION_STORAGE_KEY, '1')
    }
  } catch {
    // Without storage we cannot dedupe sessions; claiming one is the
    // conservative default and the server still validates everything.
  }
  return { visitorKey, newSession }
}

/** Test helper: drop the in-memory identity so storage is read again. */
export function resetVisitorIdentityForTests(): void {
  cachedKey = null
}

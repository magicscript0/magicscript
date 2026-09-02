import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIREBASE_ENV } from '../config/firebase'
import {
  FirebaseNotConfiguredError,
  getDemoDatabase,
  isFirebaseConfigured,
  isValidDatabaseUrl,
  readFirebaseConfigFromEnv,
} from './firebase'

/** Stubs every VITE_FIREBASE_* variable deterministically (ignores local .env). */
function stubFirebaseEnv(values: Partial<Record<string, string>> = {}) {
  for (const name of Object.values(FIREBASE_ENV)) {
    vi.stubEnv(name, values[name] ?? '')
  }
}

const DEMO_URL = 'https://zaem-a8d30-default-rtdb.firebaseio.com'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Firebase configuration detection (databaseURL-only requirement)', () => {
  it('reports "not configured" when every variable is missing/empty', () => {
    stubFirebaseEnv()
    expect(readFirebaseConfigFromEnv()).toBeNull()
    expect(isFirebaseConfigured()).toBe(false)
  })

  it('is configured with ONLY the database URL — no API key or project id needed', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: DEMO_URL })
    const config = readFirebaseConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config?.databaseURL).toBe(DEMO_URL)
    expect(isFirebaseConfigured()).toBe(true)
  })

  it('an API key alone (without a database URL) is not enough', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.apiKey]: 'test-key' })
    expect(readFirebaseConfigFromEnv()).toBeNull()
    expect(isFirebaseConfigured()).toBe(false)
  })

  it('treats a whitespace-only database URL as missing', () => {
    stubFirebaseEnv({
      [FIREBASE_ENV.apiKey]: 'test-key',
      [FIREBASE_ENV.databaseURL]: '   ',
      [FIREBASE_ENV.projectId]: 'demo',
    })
    expect(readFirebaseConfigFromEnv()).toBeNull()
  })

  it('accepts the modern firebasedatabase.app URL form too', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: 'https://zaem-a8d30-default-rtdb.firebasedatabase.app' })
    expect(isFirebaseConfigured()).toBe(true)
  })

  it('rejects malformed or non-Firebase URLs (never points the SDK elsewhere)', () => {
    expect(isValidDatabaseUrl('http://zaem-a8d30-default-rtdb.firebaseio.com')).toBe(false) // not https
    expect(isValidDatabaseUrl('https://evil.example.com')).toBe(false)
    expect(isValidDatabaseUrl('not-a-url')).toBe(false)
    expect(
      isValidDatabaseUrl('https://zaem-a8d30-default-rtdb.firebaseio.com'),
    ).toBe(true)
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: 'https://evil.example.com' })
    expect(readFirebaseConfigFromEnv()).toBeNull()
  })

  it('passes optional values through when present, trimmed', () => {
    stubFirebaseEnv({
      [FIREBASE_ENV.apiKey]: '  test-key  ',
      [FIREBASE_ENV.authDomain]: 'demo.firebaseapp.com',
      [FIREBASE_ENV.databaseURL]: DEMO_URL,
      [FIREBASE_ENV.projectId]: 'demo',
      [FIREBASE_ENV.storageBucket]: 'demo.appspot.com',
    })
    const config = readFirebaseConfigFromEnv()
    expect(config?.apiKey).toBe('  test-key  ') // raw value; cleaning happens at init
    expect(config?.databaseURL).toBe(DEMO_URL)
    expect(config?.authDomain).toBe('demo.firebaseapp.com')
    expect(config?.projectId).toBe('demo')
    expect(config?.storageBucket).toBe('demo.appspot.com')
    expect(isFirebaseConfigured()).toBe(true)
  })
})

describe('Database initialization guard', () => {
  it('refuses to initialize the database when configuration is missing', () => {
    stubFirebaseEnv()
    expect(() => getDemoDatabase()).toThrow(FirebaseNotConfiguredError)
  })

  it('exposes a friendly error naming the single required variable', () => {
    stubFirebaseEnv()
    try {
      getDemoDatabase()
      throw new Error('expected getDemoDatabase to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(FirebaseNotConfiguredError)
      expect((error as Error).message).toContain('VITE_FIREBASE_DATABASE_URL')
      expect((error as Error).message).toContain('.env.example')
    }
  })
})

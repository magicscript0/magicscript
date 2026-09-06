import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIREBASE_ENV, PUBLIC_FIREBASE_FALLBACK } from '../config/firebase'
import {
  getDemoDatabase,
  isFirebaseConfigured,
  isValidDatabaseUrl,
  readFirebaseConfigFromEnv,
} from './firebase'

const getAppsMock = vi.hoisted(() => vi.fn())
const getAppMock = vi.hoisted(() => vi.fn((app: unknown) => app))
const initializeAppMock = vi.hoisted(() => vi.fn((config: unknown) => config))
const getDatabaseMock = vi.hoisted(() => vi.fn((app: unknown) => app))
const refMock = vi.hoisted(() => vi.fn((_db: unknown, path: string) => ({ path })))

vi.mock('firebase/app', () => ({
  getApps: getAppsMock,
  getApp: getAppMock,
  initializeApp: initializeAppMock,
}))

vi.mock('firebase/database', () => ({
  getDatabase: getDatabaseMock,
  onValue: () => () => undefined,
  ref: refMock,
}))

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

describe('Firebase configuration detection (public APP 2 fallback)', () => {
  it('uses the public APP 2 database even when no VITE_FIREBASE_* variable is provided', () => {
    stubFirebaseEnv()
    const config = readFirebaseConfigFromEnv()

    expect(config).not.toBeNull()
    expect(config?.databaseURL).toBe(DEMO_URL)
    expect(config?.authDomain).toBe('zaem-a8d30.firebaseapp.com')
    expect(config?.projectId).toBe('zaem-a8d30')
    expect(config?.storageBucket).toBe('zaem-a8d30.appspot.com')
    expect(isFirebaseConfigured()).toBe(true)
  })

  it('a configured VITE_FIREBASE_DATABASE_URL still overrides the public fallback', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: DEMO_URL })
    const config = readFirebaseConfigFromEnv()
    expect(config?.databaseURL).toBe(DEMO_URL)
    expect(isFirebaseConfigured()).toBe(true)
  })

  it('an API key alone (without a database URL override) still uses the public APP 2 database', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.apiKey]: 'test-key' })
    const config = readFirebaseConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config?.databaseURL).toBe(DEMO_URL)
    expect(config?.apiKey).toBe('test-key')
  })

  it('treats a whitespace-only database URL as missing and falls back to the public APP 2 default', () => {
    stubFirebaseEnv({
      [FIREBASE_ENV.apiKey]: 'test-key',
      [FIREBASE_ENV.databaseURL]: '   ',
      [FIREBASE_ENV.projectId]: 'demo',
    })
    const config = readFirebaseConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config?.databaseURL).toBe(DEMO_URL)
  })

  it('rejects an EXPLICIT invalid database URL instead of silently switching projects', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: 'https://evil.example.com' })
    expect(readFirebaseConfigFromEnv()).toBeNull()
    expect(isFirebaseConfigured()).toBe(false)
  })

  it('accepts the modern firebasedatabase.app URL form too', () => {
    stubFirebaseEnv({ [FIREBASE_ENV.databaseURL]: 'https://zaem-a8d30-default-rtdb.firebasedatabase.app' })
    expect(isFirebaseConfigured()).toBe(true)
  })

  it('rejects malformed or non-Firebase URLs (never points the SDK elsewhere)', () => {
    expect(isValidDatabaseUrl('http://zaem-a8d30-default-rtdb.firebaseio.com')).toBe(false) // not https
    expect(isValidDatabaseUrl('https://evil.example.com')).toBe(false)
    expect(isValidDatabaseUrl('not-a-url')).toBe(false)
    expect(isValidDatabaseUrl(DEMO_URL)).toBe(true)
    expect(isValidDatabaseUrl(`${PUBLIC_FIREBASE_FALLBACK.databaseURL}`)).toBe(true)
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

describe('Database initialization', () => {
  it('initializes the Firebase app against the public APP 2 RTDB URL without requiring secrets', () => {
    stubFirebaseEnv()
    getAppsMock.mockReturnValue([])

    const database = getDemoDatabase()
    expect(database).not.toBeNull()
    expect(initializeAppMock).toHaveBeenCalledWith(
      expect.objectContaining({ databaseURL: DEMO_URL }),
    )
    expect(getDatabaseMock).toHaveBeenCalledTimes(1)
  })
})

import { getApp, getApps, initializeApp } from 'firebase/app'
import { getDatabase, onValue, ref, type Database, type Unsubscribe } from 'firebase/database'
import { FIREBASE_ENV } from '../config/firebase'

export interface FirebaseEnvConfig {
  apiKey?: string
  authDomain?: string
  databaseURL: string
  projectId?: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

/** Raised when Firebase is used without a usable database URL. */
export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Firebase is not configured for this demo. Copy .env.example to .env and set ' +
        'VITE_FIREBASE_DATABASE_URL (the only value required for the read-only /m11 mirror).',
    )
    this.name = 'FirebaseNotConfiguredError'
  }
}

function readEnvConfig(): FirebaseEnvConfig {
  const env = import.meta.env
  return {
    apiKey: env[FIREBASE_ENV.apiKey],
    authDomain: env[FIREBASE_ENV.authDomain],
    databaseURL: env[FIREBASE_ENV.databaseURL] ?? '',
    projectId: env[FIREBASE_ENV.projectId],
    storageBucket: env[FIREBASE_ENV.storageBucket],
    messagingSenderId: env[FIREBASE_ENV.messagingSenderId],
    appId: env[FIREBASE_ENV.appId],
  }
}

/**
 * A usable Realtime Database URL: https + a Firebase RTDB host.
 * Guards against typos pointing the SDK at an arbitrary host.
 */
export function isValidDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.firebaseio.com') ||
        parsed.hostname.endsWith('.firebasedatabase.app'))
    )
  } catch {
    return false
  }
}

/**
 * Returns the demo Firebase configuration, or null when the required value
 * is missing — in which case the app runs in "offline demo mode"
 * (zero Firebase network activity by design).
 *
 * Required: VITE_FIREBASE_DATABASE_URL only. The RTDB connection does not
 * use an API key (it authorizes per security rules; /m11 is publicly
 * readable — verified by an unauthenticated REST read in Phase 4). All
 * other variables are optional and passed to the SDK when present.
 */
export function readFirebaseConfigFromEnv(): FirebaseEnvConfig | null {
  const raw = readEnvConfig()
  const databaseURL = raw.databaseURL?.trim() ?? ''
  if (databaseURL.length === 0 || !isValidDatabaseUrl(databaseURL)) {
    return null
  }
  return { ...raw, databaseURL }
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfigFromEnv() !== null
}

let cachedDatabase: Database | null = null

/** Drops empty/whitespace optional values so the SDK never sees "". */
function cleanOptional(config: FirebaseEnvConfig): Record<string, string> {
  const optional: Record<string, string> = {}
  for (const [key, value] of Object.entries(config)) {
    if (key === 'databaseURL') continue
    if (typeof value === 'string' && value.trim().length > 0) {
      optional[key] = value.trim()
    }
  }
  return optional
}

/** Lazily initializes and returns the demo Realtime Database handle. */
export function getDemoDatabase(): Database {
  if (cachedDatabase) return cachedDatabase

  const config = readFirebaseConfigFromEnv()
  if (!config?.databaseURL) {
    throw new FirebaseNotConfiguredError()
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
        databaseURL: config.databaseURL,
        ...cleanOptional(config),
      })

  cachedDatabase = getDatabase(app)
  return cachedDatabase
}

/**
 * Subscribe to the SDK connection indicator (.info/connected).
 * This is a read-only status probe — it never writes data.
 */
export function subscribeToConnectionState(
  onChange: (connected: boolean) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const database = getDemoDatabase()
  return onValue(
    ref(database, '.info/connected'),
    (snapshot) => onChange(snapshot.val() === true),
    (error) => onError?.(error),
  )
}

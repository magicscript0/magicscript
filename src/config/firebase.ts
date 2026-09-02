/**
 * Firebase (demo backend) configuration.
 * Every value comes from environment variables — nothing is hardcoded here.
 */

export const FIREBASE_ENV = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

/**
 * Minimum required value for the READ-ONLY Realtime Database integration.
 *
 * The Firebase JS SDK's RTDB connection is made to the database instance
 * named in the URL and authenticates per security rules — an API key /
 * project id are NOT part of the RTDB wire protocol and are only needed
 * for other Firebase services (Auth, Firestore, …). The demo database
 * allows public reads of /m11 (verified by an unauthenticated REST read in
 * Phase 4), so a databaseURL-only initialization is sufficient here.
 * All other VITE_FIREBASE_* values remain optional passthroughs.
 */
export const REQUIRED_FIREBASE_ENV: readonly string[] = [
  FIREBASE_ENV.databaseURL,
]

/** The single node this demo is ever allowed to touch. */
export const M11_PATH = 'm11'

/**
 * Top-level nodes owned by the existing demo Android client.
 * NEVER access these — reads or writes — in any phase.
 * (Writing /main force-closes clients sitting on the splash screen.)
 */
export const FORBIDDEN_TOP_LEVEL_PATHS = ['main', 'xbetmoney', 'users', 'bet1', 'data'] as const

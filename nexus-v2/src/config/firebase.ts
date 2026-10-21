import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getDatabase, ref, onValue, type Database } from 'firebase/database'

export const FIREBASE_CONFIG = {
  databaseURL: String(import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://zaem-a8d30-default-rtdb.firebaseio.com').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'zaem-a8d30.firebaseapp.com').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || 'zaem-a8d30').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'zaem-a8d30.appspot.com').trim(),
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
}

let appInstance: FirebaseApp | null = null
let dbInstance: Database | null = null

export function getFirebaseDb(): Database | null {
  if (dbInstance) return dbInstance
  try {
    if (!getApps().length) {
      appInstance = initializeApp(FIREBASE_CONFIG)
    } else {
      appInstance = getApps()[0]
    }
    dbInstance = getDatabase(appInstance)
    return dbInstance
  } catch (err) {
    console.warn('[Firebase] Failed to initialize RTDB:', err)
    return null
  }
}

export function subscribeToM11(callback: (data: any) => void): () => void {
  const db = getFirebaseDb()
  if (!db) return () => {}
  const m11Ref = ref(db, 'm11')
  const unsubscribe = onValue(m11Ref, (snapshot) => {
    callback(snapshot.val())
  }, (err) => {
    console.warn('[Firebase RTDB] /m11 listener error:', err)
  })
  return unsubscribe
}

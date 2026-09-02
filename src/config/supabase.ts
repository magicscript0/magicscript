/**
 * Supabase is the MAGIC SCRIPT control plane: authentication, roles,
 * settings, codes, history, and audit metadata live here. Firebase remains
 * the separate realtime /m11 bridge for the existing game consumer.
 */
export const SUPABASE_ENV = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const

export function readSupabaseConfig(): { url: string; publishableKey: string } | null {
  const url = String(import.meta.env[SUPABASE_ENV.url] ?? '').trim()
  const publishableKey = String(import.meta.env[SUPABASE_ENV.publishableKey] ?? '').trim()

  if (!url || !publishableKey) return null

  try {
    const parsed = new URL(url)
    const isLocalDevelopment = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    if (parsed.protocol !== 'https:' && !isLocalDevelopment) return null
  } catch {
    return null
  }

  return { url, publishableKey }
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseConfig() !== null
}

/** This value is intentionally public UI metadata, not a service credential. */
export const PRODUCT_NAME = 'MAGIC SCRIPT'

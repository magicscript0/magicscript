/**
 * Supabase is the MAGIC SCRIPT control plane: authentication, roles,
 * settings, codes, history, and audit metadata live here. Firebase remains
 * the separate realtime /m11 bridge for the existing game consumer.
 */
export const SUPABASE_ENV = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const

function looksLikeServiceRoleKey(value: string): boolean {
  const normalized = value.toLowerCase()
  if (normalized.includes('service_role') || normalized.includes('service-role') || normalized.startsWith('sb_secret_')) {
    return true
  }

  // Legacy Supabase browser keys are JWTs. Reject a privileged JWT even if it
  // was accidentally placed in the publishable-key variable.
  const payloadPart = value.split('.')[1]
  if (!payloadPart || typeof globalThis.atob !== 'function') return false
  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { role?: unknown }
    return payload.role === 'service_role' || payload.role === 'supabase_admin'
  } catch {
    return false
  }
}

/**
 * The browser accepts a Supabase publishable/anon key only. This deliberately
 * rejects the server-only service-role/secret key formats before createClient
 * can ever receive them.
 */
export function isPublishableSupabaseKey(value: string): boolean {
  const normalized = value.trim()
  return normalized.length > 0 && !looksLikeServiceRoleKey(normalized)
}

export function readSupabaseConfig(): { url: string; publishableKey: string } | null {
  const url = String(import.meta.env[SUPABASE_ENV.url] ?? '').trim()
  const publishableKey = String(import.meta.env[SUPABASE_ENV.publishableKey] ?? '').trim()

  if (!url || !isPublishableSupabaseKey(publishableKey)) return null

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

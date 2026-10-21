import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
export const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

let clientInstance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (clientInstance) return clientInstance
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  try {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
    return clientInstance
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client:', err)
    return null
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

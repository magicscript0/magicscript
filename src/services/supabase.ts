import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../config/supabase'
import type { AdminProfile, Database } from '../types/supabase'

export class ControlSystemUnavailableError extends Error {
  constructor() {
    super('The control system is temporarily unavailable.')
    this.name = 'ControlSystemUnavailableError'
  }
}

export class PermissionDeniedError extends Error {
  constructor() {
    super('You do not have permission to perform this action.')
    this.name = 'PermissionDeniedError'
  }
}

let cachedClient: SupabaseClient<Database> | null = null

/**
 * Creates one browser client with the publishable key only. A service-role
 * key is never read by this module and must stay inside server-side functions.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (cachedClient) return cachedClient
  const config = readSupabaseConfig()
  if (!config) return null

  cachedClient = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return cachedClient
}

export function isControlSystemConfigured(): boolean {
  return getSupabaseClient() !== null
}

function requireClient(): SupabaseClient<Database> {
  const client = getSupabaseClient()
  if (!client) throw new ControlSystemUnavailableError()
  return client
}

function toProfile(row: {
  id: string
  email: string
  username: string | null
  role: AdminProfile['role']
  active: boolean
}): AdminProfile {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    active: row.active,
  }
}

export async function getAdminProfile(userId: string): Promise<AdminProfile | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('admin_users')
    .select('id, email, username, role, active')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? toProfile(data) : null
}

export async function signInAdmin(email: string, password: string): Promise<AdminProfile> {
  const client = requireClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error || !data.user) {
    throw new Error('The email or password could not be verified.')
  }

  try {
    const profile = await getAdminProfile(data.user.id)
    if (!profile || !profile.active) {
      await client.auth.signOut()
      throw new PermissionDeniedError()
    }
    return profile
  } catch (error) {
    await client.auth.signOut()
    if (error instanceof PermissionDeniedError) throw error
    throw new Error('Your administrator profile could not be loaded.')
  }
}

export async function signOutAdmin(): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.auth.signOut()
  if (error) throw new Error('The session could not be closed.')
}

export async function getCurrentAdmin(): Promise<AdminProfile | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data, error } = await client.auth.getSession()
  if (error || !data.session?.user) return null
  const profile = await getAdminProfile(data.session.user.id)
  if (!profile?.active) {
    await client.auth.signOut()
    return null
  }
  return profile
}

export function subscribeToAuthChanges(
  onChange: (session: Session | null, event: AuthChangeEvent) => void,
): (() => void) | null {
  const client = getSupabaseClient()
  if (!client) return null
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => onChange(session, event))
  return () => subscription.unsubscribe()
}

export function friendlyControlError(error: unknown, fallback = 'Control system temporarily unavailable.'): string {
  if (error instanceof ControlSystemUnavailableError) return error.message
  if (error instanceof PermissionDeniedError) return error.message
  if (error instanceof Error && error.message === 'The email or password could not be verified.') {
    return error.message
  }
  return fallback
}

export { requireClient }

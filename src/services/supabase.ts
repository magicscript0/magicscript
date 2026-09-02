import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../config/supabase'
import type { AdminProfile, Database } from '../types/supabase'

export type SupabaseErrorKind =
  | 'configuration'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'profile_missing'
  | 'profile_inactive'
  | 'insufficient_role'
  | 'database'
  | 'session'
  | 'network'
  | 'unknown'

export class SupabaseIntegrationError extends Error {
  readonly kind: SupabaseErrorKind

  constructor(kind: SupabaseErrorKind, message: string) {
    super(message)
    this.name = 'SupabaseIntegrationError'
    this.kind = kind
  }
}

export class ControlSystemUnavailableError extends SupabaseIntegrationError {
  constructor() {
    super('configuration', 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the site.')
    this.name = 'ControlSystemUnavailableError'
  }
}

export class InsufficientRoleError extends SupabaseIntegrationError {
  constructor() {
    super('insufficient_role', 'Your administrator role does not include this workspace action. Contact a Super Admin if access is required.')
    this.name = 'InsufficientRoleError'
  }
}

/** @deprecated Use InsufficientRoleError for new call sites. */
export class PermissionDeniedError extends InsufficientRoleError {
  constructor() {
    super()
    this.name = 'PermissionDeniedError'
  }
}

export class AdminProfileMissingError extends SupabaseIntegrationError {
  constructor() {
    super('profile_missing', 'Your Supabase Auth account is valid, but no matching admin_users profile exists. A Super Admin must provision it.')
    this.name = 'AdminProfileMissingError'
  }
}

export class InactiveAdminError extends SupabaseIntegrationError {
  constructor() {
    super('profile_inactive', 'Your MAGIC SCRIPT administrator profile is inactive. Contact a Super Admin.')
    this.name = 'InactiveAdminError'
  }
}

export class InvalidCredentialsError extends SupabaseIntegrationError {
  constructor() {
    super('invalid_credentials', 'The email or password could not be verified.')
    this.name = 'InvalidCredentialsError'
  }
}

export class EmailNotConfirmedError extends SupabaseIntegrationError {
  constructor() {
    super('email_not_confirmed', 'This email address is not confirmed in Supabase Auth.')
    this.name = 'EmailNotConfirmedError'
  }
}

export class SupabaseDatabaseError extends SupabaseIntegrationError {
  constructor(message = 'Supabase could not read the administrator profile. Check the admin_users table and its RLS policies.') {
    super('database', message)
    this.name = 'SupabaseDatabaseError'
  }
}

export class SupabaseSessionError extends SupabaseIntegrationError {
  constructor(message = 'The Supabase session could not be checked. Try again shortly.') {
    super('session', message)
    this.name = 'SupabaseSessionError'
  }
}

export class SupabaseNetworkError extends SupabaseIntegrationError {
  constructor() {
    super('network', 'Supabase could not be reached. Check the project URL, deployment network access, and try again.')
    this.name = 'SupabaseNetworkError'
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

export function requireClient(): SupabaseClient<Database> {
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

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code.toLowerCase() : ''
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase()
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message.toLowerCase() : ''
  }
  return typeof error === 'string' ? error.toLowerCase() : ''
}

function isNetworkFailure(error: unknown): boolean {
  const message = errorMessage(error)
  return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network request failed') || message.includes('load failed') || message.includes('fetch failed')
}

function isRlsFailure(error: unknown): boolean {
  const code = errorCode(error)
  const message = errorMessage(error)
  return code === '42501' || code === 'pgrst301' || message.includes('row-level security') || message.includes('permission denied') || message.includes('not allowed')
}

function classifyAuthError(error: unknown): SupabaseIntegrationError {
  const message = errorMessage(error)
  const status = errorStatus(error)
  if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) return new EmailNotConfirmedError()
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return new SupabaseIntegrationError('rate_limited', 'Too many sign-in attempts were made. Wait a moment and try again.')
  }
  if (isNetworkFailure(error)) return new SupabaseNetworkError()
  if (status === 400 || message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return new InvalidCredentialsError()
  }
  return new SupabaseIntegrationError('unknown', 'Supabase authentication could not be completed. Try again shortly.')
}

function classifyProfileError(error: unknown): SupabaseIntegrationError {
  if (error instanceof SupabaseIntegrationError) return error
  return classifySupabaseRequestError(error, 'Supabase could not read the administrator profile. Check the admin_users table and its RLS policies.')
}

/** Convert raw PostgREST/fetch failures into safe, user-facing categories. */
export function classifySupabaseRequestError(error: unknown, fallback = 'Supabase could not complete the request.'): SupabaseIntegrationError {
  if (error instanceof SupabaseIntegrationError) return error
  if (isNetworkFailure(error)) return new SupabaseNetworkError()
  if (errorCode(error) === 'pgrst301' || errorStatus(error) === 401) {
    return new SupabaseSessionError('The Supabase session is no longer valid. Sign in again.')
  }
  if (isRlsFailure(error) || errorStatus(error) === 403) {
    return new SupabaseDatabaseError('Supabase denied this operation. Check your administrator role and the table RLS policies.')
  }
  return new SupabaseDatabaseError(fallback)
}

async function clearSession(client: SupabaseClient<Database>): Promise<void> {
  try {
    await client.auth.signOut()
  } catch {
    // The original authentication failure is more useful than a sign-out error.
  }
}

async function signInWithPassword(client: SupabaseClient<Database>, email: string, password: string) {
  try {
    return await client.auth.signInWithPassword({ email: email.trim(), password })
  } catch (cause) {
    throw classifyAuthError(cause)
  }
}

async function getSession(client: SupabaseClient<Database>) {
  try {
    return await client.auth.getSession()
  } catch (cause) {
    if (isNetworkFailure(cause)) throw new SupabaseNetworkError()
    throw new SupabaseSessionError()
  }
}

export async function getAdminProfile(userId: string): Promise<AdminProfile | null> {
  const client = requireClient()
  try {
    const { data, error } = await client
      .from('admin_users')
      .select('id, email, username, role, active')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw classifyProfileError(error)
    return data ? toProfile(data) : null
  } catch (cause) {
    if (cause instanceof SupabaseIntegrationError) throw cause
    throw classifyProfileError(cause)
  }
}

export async function signInAdmin(email: string, password: string): Promise<AdminProfile> {
  const client = requireClient()
  const { data, error } = await signInWithPassword(client, email, password)

  if (error || !data.user) {
    throw classifyAuthError(error ?? new Error('Supabase did not return an authenticated user.'))
  }

  try {
    const profile = await getAdminProfile(data.user.id)
    if (!profile) throw new AdminProfileMissingError()
    if (!profile.active) throw new InactiveAdminError()
    return profile
  } catch (cause) {
    await clearSession(client)
    if (cause instanceof SupabaseIntegrationError) throw cause
    throw classifyProfileError(cause)
  }
}

export async function signOutAdmin(): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  try {
    const { error } = await client.auth.signOut()
    if (error) {
      if (isNetworkFailure(error)) throw new SupabaseNetworkError()
      throw new SupabaseSessionError('The Supabase session could not be closed. Try again.')
    }
  } catch (cause) {
    if (cause instanceof SupabaseIntegrationError) throw cause
    if (isNetworkFailure(cause)) throw new SupabaseNetworkError()
    throw new SupabaseSessionError('The Supabase session could not be closed. Try again.')
  }
}

export async function getCurrentAdmin(): Promise<AdminProfile | null> {
  const client = requireClient()
  const { data, error } = await getSession(client)
  if (error) {
    if (isNetworkFailure(error)) throw new SupabaseNetworkError()
    throw new SupabaseSessionError()
  }
  if (!data.session?.user) return null

  const profile = await getAdminProfile(data.session.user.id)
  if (!profile) {
    await clearSession(client)
    throw new AdminProfileMissingError()
  }
  if (!profile.active) {
    await clearSession(client)
    throw new InactiveAdminError()
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

export function friendlyControlError(error: unknown, fallback = 'Supabase could not complete the request.'): string {
  if (error instanceof SupabaseIntegrationError) return error.message
  if (isNetworkFailure(error)) return 'Supabase could not be reached. Check the project URL, deployment network access, and try again.'
  return fallback
}

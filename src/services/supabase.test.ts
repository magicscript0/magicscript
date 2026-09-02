import { describe, expect, it } from 'vitest'
import {
  AdminProfileMissingError,
  EmailNotConfirmedError,
  InactiveAdminError,
  InsufficientRoleError,
  InvalidCredentialsError,
  SupabaseDatabaseError,
  SupabaseNetworkError,
  SupabaseSessionError,
  classifySupabaseRequestError,
  friendlyControlError,
} from './supabase'

describe('Supabase integration diagnostics', () => {
  it('keeps authentication and authorization categories distinct', () => {
    expect(new InvalidCredentialsError().kind).toBe('invalid_credentials')
    expect(new EmailNotConfirmedError().kind).toBe('email_not_confirmed')
    expect(new AdminProfileMissingError().kind).toBe('profile_missing')
    expect(new InactiveAdminError().kind).toBe('profile_inactive')
    expect(new InsufficientRoleError().kind).toBe('insufficient_role')
    expect(new SupabaseSessionError().kind).toBe('session')
  })

  it('classifies fetch failures without leaking the underlying error', () => {
    const diagnostic = classifySupabaseRequestError(new Error('Failed to fetch https://secret.internal'))
    expect(diagnostic).toBeInstanceOf(SupabaseNetworkError)
    expect(friendlyControlError(diagnostic)).not.toContain('secret.internal')
  })

  it('classifies an expired JWT response as a session failure', () => {
    const diagnostic = classifySupabaseRequestError({ status: 401, code: 'PGRST301', message: 'JWT expired' })
    expect(diagnostic).toBeInstanceOf(SupabaseSessionError)
    expect(diagnostic.kind).toBe('session')
    expect(diagnostic.message).not.toContain('JWT')
  })

  it('classifies RLS and permission failures as database authorization errors', () => {
    const diagnostic = classifySupabaseRequestError({
      code: '42501',
      message: 'new row violates row-level security policy for relation admin_codes',
      details: 'sensitive database detail',
    })
    expect(diagnostic).toBeInstanceOf(SupabaseDatabaseError)
    expect(diagnostic.kind).toBe('database')
    expect(diagnostic.message).toContain('RLS')
    expect(diagnostic.message).not.toContain('sensitive')
  })

  it('uses a safe operation-specific fallback for other database failures', () => {
    const diagnostic = classifySupabaseRequestError(
      { code: '23505', message: 'duplicate key value contains secret data' },
      'The admin code could not be created.',
    )
    expect(diagnostic.kind).toBe('database')
    expect(diagnostic.message).toBe('The admin code could not be created.')
    expect(diagnostic.message).not.toContain('secret')
  })
})

import { describe, expect, it } from 'vitest'
import { isPublishableSupabaseKey } from './supabase'

describe('Supabase browser key guard', () => {
  it('accepts the publishable key format', () => {
    expect(isPublishableSupabaseKey('sb_publishable_example')).toBe(true)
  })

  it('rejects the explicit server-only secret format', () => {
    expect(isPublishableSupabaseKey('sb_secret_example')).toBe(false)
    expect(isPublishableSupabaseKey('service_role_example')).toBe(false)
  })

  it('rejects a legacy JWT carrying a privileged role', () => {
    const payload = globalThis.btoa(JSON.stringify({ role: 'service_role' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(isPublishableSupabaseKey(`header.${payload}.signature`)).toBe(false)
  })

  it('allows a legacy JWT carrying the anonymous role', () => {
    const payload = globalThis.btoa(JSON.stringify({ role: 'anon' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(isPublishableSupabaseKey(`header.${payload}.signature`)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  adminCodeStatus,
  generateAdminCode,
  hashAdminCode,
  isAdminCodeUsable,
} from './adminCodes'

const baseCode = {
  active: true,
  expires_at: null,
  revoked_at: null,
  uses_count: 0,
  max_uses: 1,
}

describe('admin code primitives', () => {
  it('generates a formatted high-entropy code without ambiguous characters', () => {
    const code = generateAdminCode()
    expect(code).toMatch(/^MS-[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}$/)
    expect(code).not.toMatch(/[IO01]/)
  })

  it('hashes the exact code with SHA-256', async () => {
    await expect(hashAdminCode('MS-TEST')).resolves.toBe(
      'c2184f9a2808b4f404c11972f0cfb80c5c45286c4fe962feb6c62b992bb9dc2a',
    )
  })

  it('reports expiration, revocation, exhaustion, and inactive states', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    expect(adminCodeStatus(baseCode, now)).toBe('active')
    expect(adminCodeStatus({ ...baseCode, active: false }, now)).toBe('inactive')
    expect(adminCodeStatus({ ...baseCode, expires_at: '2026-09-01T12:00:00.000Z' }, now)).toBe('expired')
    expect(adminCodeStatus({ ...baseCode, revoked_at: '2026-09-01T12:00:00.000Z' }, now)).toBe('revoked')
    expect(adminCodeStatus({ ...baseCode, uses_count: 1 }, now)).toBe('exhausted')
  })

  it('allows a code only while it is active, unexpired, and below its use limit', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    expect(isAdminCodeUsable({ ...baseCode, expires_at: '2026-09-03T12:00:00.000Z' }, now)).toBe(true)
    expect(isAdminCodeUsable({ ...baseCode, expires_at: '2026-09-01T12:00:00.000Z' }, now)).toBe(false)
    expect(isAdminCodeUsable({ ...baseCode, uses_count: 1 }, now)).toBe(false)
    expect(isAdminCodeUsable({ ...baseCode, active: false }, now)).toBe(false)
  })
})

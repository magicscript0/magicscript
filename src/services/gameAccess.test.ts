import { describe, expect, it } from 'vitest'
import {
  GameAccessError,
  classifyGameAccessError,
  describeAccessCodeIssue,
  describeAccountIdIssue,
  formatDurationMinutes,
  gameAccessCodeStatus,
  isValidAccountId,
  normalizeAccountId,
} from './gameAccess'

describe('Account ID rules', () => {
  it('accepts 9, 10, and 11 digit identifiers', () => {
    expect(isValidAccountId('123456789')).toBe(true)
    expect(isValidAccountId('1234567890')).toBe(true)
    expect(isValidAccountId('12345678901')).toBe(true)
  })

  it('rejects empty, short, long, and non-numeric identifiers', () => {
    expect(isValidAccountId('')).toBe(false)
    expect(isValidAccountId('12345678')).toBe(false)
    expect(isValidAccountId('123456789012')).toBe(false)
    expect(isValidAccountId('12345678a')).toBe(false)
    expect(isValidAccountId('123-456-789')).toBe(false)
  })

  it('normalizes surrounding whitespace but keeps the digits', () => {
    expect(normalizeAccountId(' 123 456 789 ')).toBe('123456789')
  })

  it('explains each invalid shape without technical detail', () => {
    expect(describeAccountIdIssue('')).toBe('Enter your Account ID.')
    expect(describeAccountIdIssue('12345678')).toBe('The Account ID must be 9–11 digits.')
    expect(describeAccountIdIssue('123456789012')).toBe('The Account ID must be 9–11 digits.')
    expect(describeAccountIdIssue('12345abc9')).toBe('The Account ID can contain numbers only.')
    expect(describeAccountIdIssue('123456789')).toBeNull()
  })
})

describe('Access Code rules', () => {
  it('requires a non-empty, reasonably sized code', () => {
    expect(describeAccessCodeIssue('')).toBe('Enter your Access Code.')
    expect(describeAccessCodeIssue('   ')).toBe('Enter your Access Code.')
    expect(describeAccessCodeIssue('x'.repeat(161))).toBe('This Access Code is too long to be valid.')
    expect(describeAccessCodeIssue('MS-ABCDE-FGHIJ-KLMNP-QRSTU')).toBeNull()
  })
})

describe('game access code status', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z')
  const base = { active: true, expires_at: '2026-09-02T13:00:00.000Z', revoked_at: null }

  it('reports active, expired, revoked, and inactive states', () => {
    expect(gameAccessCodeStatus(base, now)).toBe('active')
    expect(gameAccessCodeStatus({ ...base, expires_at: '2026-09-02T11:59:00.000Z' }, now)).toBe('expired')
    expect(gameAccessCodeStatus({ ...base, revoked_at: '2026-09-02T11:00:00.000Z' }, now)).toBe('revoked')
    expect(gameAccessCodeStatus({ ...base, active: false }, now)).toBe('inactive')
  })

  it('treats the exact expiry instant as expired', () => {
    expect(gameAccessCodeStatus({ ...base, expires_at: '2026-09-02T12:00:00.000Z' }, now)).toBe('expired')
  })
})

describe('duration formatting', () => {
  it('formats presets human-readably', () => {
    expect(formatDurationMinutes(15)).toBe('15 minutes')
    expect(formatDurationMinutes(60)).toBe('1 hour')
    expect(formatDurationMinutes(120)).toBe('2 hours')
    expect(formatDurationMinutes(1440)).toBe('1 day')
    expect(formatDurationMinutes(2880)).toBe('2 days')
    expect(formatDurationMinutes(45)).toBe('45 minutes')
  })
})

describe('server error classification', () => {
  it('maps expired/revoked/unknown code verdicts to a safe message', () => {
    const unavailable = classifyGameAccessError({ message: 'ACCESS_CODE_UNAVAILABLE' })
    expect(unavailable).toBeInstanceOf(GameAccessError)
    expect(unavailable.kind).toBe('unavailable')
    expect(unavailable.message).not.toMatch(/expired|revoked|supabase|rls/i)
  })

  it('maps invalid account and invalid code verdicts', () => {
    expect(classifyGameAccessError({ message: 'INVALID_ACCOUNT_ID' }).kind).toBe('invalid_account')
    expect(classifyGameAccessError({ message: 'INVALID_ACCESS_CODE' }).kind).toBe('invalid_code')
  })

  it('maps network failures to a retryable message', () => {
    expect(classifyGameAccessError(new TypeError('Failed to fetch')).kind).toBe('network')
  })
})

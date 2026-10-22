import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { beginVisitorSession, generateVisitorKey, getVisitorKey, resetVisitorIdentityForTests } from './visitorIdentity'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetVisitorIdentityForTests()
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetVisitorIdentityForTests()
})

describe('visitor key generation', () => {
  it('generates valid random UUID v4 keys', () => {
    const keys = new Set(Array.from({ length: 25 }, () => generateVisitorKey()))
    expect(keys.size).toBe(25)
    for (const key of keys) expect(key).toMatch(UUID_PATTERN)
  })
})

describe('visitor identity persistence', () => {
  it('creates the key once and keeps it stable across calls', () => {
    const first = getVisitorKey()
    const second = getVisitorKey()
    expect(first).toMatch(UUID_PATTERN)
    expect(second).toBe(first)
    expect(localStorage.getItem('ms.visitor.key.v1')).toBe(first)
  })

  it('adopts a previously stored key (returning visitor)', () => {
    localStorage.setItem('ms.visitor.key.v1', '0f0f0f0f-1234-4abc-8def-000000000000')
    expect(getVisitorKey()).toBe('0f0f0f0f-1234-4abc-8def-000000000000')
  })

  it('replaces a corrupted stored value instead of trusting it', () => {
    localStorage.setItem('ms.visitor.key.v1', 'not-a-uuid; drop table')
    const fresh = getVisitorKey()
    expect(fresh).toMatch(UUID_PATTERN)
    expect(fresh).not.toContain('drop table')
    expect(localStorage.getItem('ms.visitor.key.v1')).toBe(fresh)
  })

  it('stores nothing except the random pseudonym (no secrets, no metadata)', () => {
    getVisitorKey()
    beginVisitorSession()
    const stored = [...Object.entries(localStorage), ...Object.entries(sessionStorage)]
    expect(stored.map(([key]) => key).sort()).toEqual(['ms.visitor.key.v1', 'ms.visitor.session.v1'])
    expect(stored.every(([, value]) => value === '1' || UUID_PATTERN.test(value))).toBe(true)
  })
})

describe('session epoch', () => {
  it('reports a new browser session exactly once per tab', () => {
    expect(beginVisitorSession().newSession).toBe(true)
    expect(beginVisitorSession().newSession).toBe(false)
    expect(beginVisitorSession().newSession).toBe(false)
  })

  it('reports a new session again after the tab marker disappears', () => {
    beginVisitorSession()
    sessionStorage.removeItem('ms.visitor.session.v1')
    expect(beginVisitorSession().newSession).toBe(true)
  })

  it('keeps the same visitor key across browser sessions', () => {
    const key = beginVisitorSession().visitorKey
    sessionStorage.clear()
    expect(beginVisitorSession().visitorKey).toBe(key)
  })
})

import { describe, expect, it } from 'vitest'
import { isValidHttpUrl } from './urls'

describe('public link validation', () => {
  it('accepts http and https destinations', () => {
    expect(isValidHttpUrl('https://t.me/fox_script_vip')).toBe(true)
    expect(isValidHttpUrl('http://localhost:3000/channel')).toBe(true)
  })

  it('rejects malformed, non-web, and whitespace-only values', () => {
    expect(isValidHttpUrl('')).toBe(false)
    expect(isValidHttpUrl('  ')).toBe(false)
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isValidHttpUrl('not a url')).toBe(false)
  })
})

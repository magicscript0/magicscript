import { describe, expect, it } from 'vitest'
import { approximateCountryFromTimezone, resolveApproximateCountry } from './approximateLocation'

describe('timezone → approximate country', () => {
  it('maps primary IANA zones to ISO-2 countries', () => {
    expect(approximateCountryFromTimezone('Europe/Berlin')).toBe('DE')
    expect(approximateCountryFromTimezone('America/New_York')).toBe('US')
    expect(approximateCountryFromTimezone('America/Los_Angeles')).toBe('US')
    expect(approximateCountryFromTimezone('Asia/Kolkata')).toBe('IN')
    expect(approximateCountryFromTimezone('Asia/Calcutta')).toBe('IN') // legacy alias
    expect(approximateCountryFromTimezone('Europe/Kyiv')).toBe('UA')
    expect(approximateCountryFromTimezone('Europe/Kiev')).toBe('UA')    // legacy alias
    expect(approximateCountryFromTimezone('Pacific/Auckland')).toBe('NZ')
    expect(approximateCountryFromTimezone('America/Sao_Paulo')).toBe('BR')
    expect(approximateCountryFromTimezone('Asia/Tokyo')).toBe('JP')
  })

  it('returns null for unknown, ambiguous, or missing zones instead of guessing', () => {
    expect(approximateCountryFromTimezone('Mars/Olympus_Mons')).toBeNull()
    expect(approximateCountryFromTimezone('UTC')).toBeNull()
    expect(approximateCountryFromTimezone('Etc/GMT+3')).toBeNull()
    expect(approximateCountryFromTimezone('')).toBeNull()
    expect(approximateCountryFromTimezone(null)).toBeNull()
    expect(approximateCountryFromTimezone(undefined)).toBeNull()
  })

  it('resolves safely in any environment (fail-safe, offline)', () => {
    const country = resolveApproximateCountry()
    expect(country === null || /^[A-Z]{2}$/.test(country)).toBe(true)
  })
})

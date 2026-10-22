import { describe, expect, it } from 'vitest'
import { formatLocalDateTime, msUntilNextMinute } from './localClock'

/** A fixed instant: 2026-09-09T18:42:00Z (18:42 UTC). */
const INSTANT = new Date('2026-09-09T18:42:00Z')

describe('formatLocalDateTime', () => {
  it('renders day, short month, year, and hour:minute without seconds', () => {
    const out = formatLocalDateTime(INSTANT, '12h', 'en-GB', 'UTC')
    expect(out).toMatch(/^\d{2} [A-Za-z]{3,4} \d{4} · \d{2}:\d{2}( [A-Za-z]+)?$/)
    expect(out).not.toMatch(/:\d{2}:\d{2}/)
  })

  it('derives the wall-clock time from the requested timezone, not a fixed clock', () => {
    // London (UTC+1 in Sep) → 19:42 · New York (UTC-4 in Sep) → 14:42.
    const london = formatLocalDateTime(INSTANT, '24h', 'en-GB', 'Europe/London')
    const newYork = formatLocalDateTime(INSTANT, '24h', 'en-GB', 'America/New_York')
    expect(london).toContain('19:42')
    expect(newYork).toContain('14:42')
    expect(london).not.toBe(newYork)
  })

  it('renders an AM/PM day period in 12-hour mode and none in 24-hour mode', () => {
    const twelve = formatLocalDateTime(INSTANT, '12h', 'en-GB', 'UTC')
    const twentyFour = formatLocalDateTime(INSTANT, '24h', 'en-GB', 'UTC')
    expect(twentyFour).toContain('18:42')
    expect(twelve).toContain('06:42')
    expect(twelve).toMatch(/(am|pm)/i)
    expect(twentyFour).not.toMatch(/(am|pm)/i)
  })

  it('never includes a seconds component in either mode', () => {
    for (const clock of ['12h', '24h'] as const) {
      const out = formatLocalDateTime(INSTANT, clock, 'en-GB', 'UTC')
      expect(out).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    }
  })
})

describe('msUntilNextMinute', () => {
  it('returns the milliseconds remaining until the next minute boundary', () => {
    expect(msUntilNextMinute(0)).toBe(60_000)
    expect(msUntilNextMinute(1_000)).toBe(59_000)
    expect(msUntilNextMinute(59_999)).toBe(1)
    expect(msUntilNextMinute(60_000)).toBe(60_000)
  })
})

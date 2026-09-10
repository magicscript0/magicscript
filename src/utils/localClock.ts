import type { LocalClockMode } from '../types/supabase'

export const MINUTE_MS = 60_000

/**
 * Formats a moment as a polished local date + time, e.g.
 * `09 Sep 2026 · 08:42 PM` (12-hour) or `09 Sep 2026 · 20:42` (24-hour).
 *
 * Day / month / year are derived with the SAME locale + timezone as the time
 * (so a midnight crossing never mixes two zones), and seconds are never shown.
 * With no explicit locale/timezone the browser's own locale and timezone are
 * used — which is what makes two visitors in different countries each see
 * their own correct local time.
 */
export function formatLocalDateTime(
  date: Date,
  clock: LocalClockMode = '12h',
  locale?: string,
  timeZone?: string,
): string {
  const timeOptions: Intl.DateTimeFormatOptions =
    clock === '12h'
      ? { hour: '2-digit', minute: '2-digit', hour12: true }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

  const parts = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...timeOptions,
    timeZone,
  }).formatToParts(date)

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  const day = pick('day')
  const month = pick('month')
  const year = pick('year')
  const hour = pick('hour')
  const minute = pick('minute')
  const dayPeriod = pick('dayPeriod')

  const time = clock === '12h' && dayPeriod ? `${hour}:${minute} ${dayPeriod}` : `${hour}:${minute}`

  return `${day} ${month} ${year} · ${time}`
}

/** Milliseconds from `nowMs` until the top of the next minute (1..60000). */
export function msUntilNextMinute(nowMs: number = Date.now()): number {
  return MINUTE_MS - (nowMs % MINUTE_MS)
}

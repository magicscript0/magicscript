import { relativeTimeArabic } from '../i18n/dashboard'

/**
 * Arabic relative time for the admin control center ("منذ 5 دقائق").
 * Admin-facing only — the public game never uses this helper.
 */
export function formatRelativeTime(value: string | number): string {
  return relativeTimeArabic(value)
}

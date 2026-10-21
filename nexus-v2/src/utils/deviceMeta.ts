/**
 * Privacy-safe technical environment metadata for visitor monitoring.
 *
 * Everything here is derived from data the browser ALREADY exposes to every
 * website (user-agent string, document.referrer) and reduced to coarse,
 * non-identifying categories:
 *
 *   - device class:  mobile / desktop / tablet / unknown
 *   - browser family: "Chrome", "Firefox", … (never a version fingerprint)
 *   - OS family:      "Windows", "Android", … (never a version fingerprint)
 *   - referrer:       HOSTNAME only (paths, queries, and fragments of the
 *                     referring URL are discarded before they leave the
 *                     browser), and same-site referrers are dropped.
 *   - country:        ISO 3166-1 alpha-2 only, normalized to uppercase.
 *
 * No IP address, no coordinates, no storage keys, and no personal
 * identifiers are ever produced by this module.
 */

import type { VisitorDeviceType } from '../types/supabase'

export interface DeviceMeta {
  deviceType: VisitorDeviceType
  browser: string | null
  os: string | null
}

const TABLET_PATTERN = /ipad|tablet|playbook|silk/i
const MOBILE_PATTERN = /mobi|iphone|ipod|android[\w\s.-]*mobile|windows phone|blackberry|bb\d+|meego|opera mini|iemobile/i
const ANDROID_PATTERN = /android/i

/** Coarse device class from the UA (optionally using touch points for iPadOS). */
export function parseDeviceType(userAgent: string, maxTouchPoints = 0): VisitorDeviceType {
  const ua = userAgent.trim()
  if (ua.length === 0) return 'unknown'
  if (TABLET_PATTERN.test(ua)) return 'tablet'
  // iPadOS 13+ presents a desktop Safari UA; touch points reveal the tablet.
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'tablet'
  if (ANDROID_PATTERN.test(ua) && !/mobile/i.test(ua)) return 'tablet'
  if (MOBILE_PATTERN.test(ua)) return 'mobile'
  return 'desktop'
}

/** Browser family only — version numbers are deliberately discarded. */
export function parseBrowser(userAgent: string): string | null {
  const ua = userAgent.trim()
  if (ua.length === 0) return null
  if (/edg(?:e|a|ios)?\//i.test(ua)) return 'Edge'
  if (/opr\/|opera/i.test(ua)) return 'Opera'
  if (/samsungbrowser\//i.test(ua)) return 'Samsung Internet'
  if (/firefox\/|fxios\//i.test(ua)) return 'Firefox'
  if (/crios\/|chrome\//i.test(ua)) return 'Chrome'
  if (/safari\//i.test(ua)) return 'Safari'
  return null
}

/** OS family only — version numbers are deliberately discarded. */
export function parseOperatingSystem(userAgent: string): string | null {
  const ua = userAgent.trim()
  if (ua.length === 0) return null
  // iOS before macOS: iPhone/iPad UAs contain "like Mac OS X".
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/windows nt|win64|win32/i.test(ua)) return 'Windows'
  // Android before Linux: Android UAs contain "Linux".
  if (ANDROID_PATTERN.test(ua)) return 'Android'
  if (/mac os x|macintosh/i.test(ua)) return 'macOS'
  if (/cros/i.test(ua)) return 'ChromeOS'
  if (/linux|x11/i.test(ua)) return 'Linux'
  return null
}

export function parseDeviceMeta(userAgent: string, maxTouchPoints = 0): DeviceMeta {
  return {
    deviceType: parseDeviceType(userAgent, maxTouchPoints),
    browser: parseBrowser(userAgent),
    os: parseOperatingSystem(userAgent),
  }
}

/**
 * Normalizes an approximate country to ISO 3166-1 alpha-2 (uppercase).
 * Anything else — free text, longer codes, empty values — becomes null.
 */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[a-z]{2}$/i.test(trimmed) ? trimmed.toUpperCase() : null
}

/**
 * Reduces a referrer URL to its hostname (lowercase, ≤253 chars).
 * Returns null for empty/invalid referrers and for same-site navigation,
 * so the full referring URL never leaves the browser.
 */
export function referrerHost(referrer: string | null | undefined, currentHost?: string | null): string | null {
  if (typeof referrer !== 'string' || referrer.trim().length === 0) return null
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase().slice(0, 253)
    if (host.length === 0) return null
    const own = typeof currentHost === 'string' ? currentHost.toLowerCase() : ''
    if (own.length > 0 && (host === own || host === `www.${own}` || own === `www.${host}`)) return null
    return host
  } catch {
    return null
  }
}

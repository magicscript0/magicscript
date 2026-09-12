import { describe, expect, it } from 'vitest'
import {
  normalizeCountryCode,
  parseBrowser,
  parseDeviceMeta,
  parseDeviceType,
  parseOperatingSystem,
  referrerHost,
} from './deviceMeta'

const UA = {
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iPhoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iPadDesktopUA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  firefoxBrowser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  edgeBrowser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('device type classification', () => {
  it('classifies desktop, mobile, and tablet user agents', () => {
    expect(parseDeviceType(UA.windowsChrome)).toBe('desktop')
    expect(parseDeviceType(UA.macSafari)).toBe('desktop')
    expect(parseDeviceType(UA.iPhoneSafari)).toBe('mobile')
    expect(parseDeviceType(UA.androidChrome)).toBe('mobile')
    expect(parseDeviceType(UA.androidTablet)).toBe('tablet')
  })

  it('detects iPadOS desktop-mode Safari through touch points', () => {
    expect(parseDeviceType(UA.iPadDesktopUA)).toBe('desktop')
    expect(parseDeviceType(UA.iPadDesktopUA, 5)).toBe('tablet')
  })

  it('falls back to unknown for empty user agents', () => {
    expect(parseDeviceType('')).toBe('unknown')
    expect(parseDeviceType('   ')).toBe('unknown')
  })
})

describe('browser and OS normalization', () => {
  it('reports browser families without version fingerprints', () => {
    expect(parseBrowser(UA.windowsChrome)).toBe('Chrome')
    expect(parseBrowser(UA.macSafari)).toBe('Safari')
    expect(parseBrowser(UA.iPhoneSafari)).toBe('Safari')
    expect(parseBrowser(UA.firefoxBrowser)).toBe('Firefox')
    expect(parseBrowser(UA.edgeBrowser)).toBe('Edge')
    expect(parseBrowser('')).toBeNull()
  })

  it('reports OS families without version fingerprints', () => {
    expect(parseOperatingSystem(UA.windowsChrome)).toBe('Windows')
    expect(parseOperatingSystem(UA.macSafari)).toBe('macOS')
    expect(parseOperatingSystem(UA.iPhoneSafari)).toBe('iOS')
    expect(parseOperatingSystem(UA.androidChrome)).toBe('Android')
    expect(parseOperatingSystem(UA.linuxFirefox)).toBe('Linux')
    expect(parseOperatingSystem('')).toBeNull()
  })

  it('combines everything into one coarse metadata object', () => {
    expect(parseDeviceMeta(UA.androidChrome)).toEqual({ deviceType: 'mobile', browser: 'Chrome', os: 'Android' })
    expect(parseDeviceMeta('')).toEqual({ deviceType: 'unknown', browser: null, os: null })
  })
})

describe('country normalization', () => {
  it('accepts two-letter codes in any case and normalizes to uppercase', () => {
    expect(normalizeCountryCode('de')).toBe('DE')
    expect(normalizeCountryCode(' US ')).toBe('US')
    expect(normalizeCountryCode('gb')).toBe('GB')
  })

  it('rejects anything that is not an ISO-2 code', () => {
    expect(normalizeCountryCode('Germany')).toBeNull()
    expect(normalizeCountryCode('USA')).toBeNull()
    expect(normalizeCountryCode('')).toBeNull()
    expect(normalizeCountryCode(null)).toBeNull()
    expect(normalizeCountryCode(42)).toBeNull()
    expect(normalizeCountryCode('192.168.0.1')).toBeNull()
  })
})

describe('referrer minimization', () => {
  it('reduces a referrer URL to its hostname', () => {
    expect(referrerHost('https://t.me/fox_script_vip?start=abc#top', 'example.com')).toBe('t.me')
    expect(referrerHost('https://WWW.Google.Com/search?q=magic+script')).toBe('www.google.com')
  })

  it('drops empty, invalid, non-http, and same-site referrers', () => {
    expect(referrerHost('', 'example.com')).toBeNull()
    expect(referrerHost(null, 'example.com')).toBeNull()
    expect(referrerHost('not a url', 'example.com')).toBeNull()
    expect(referrerHost('javascript:alert(1)', 'example.com')).toBeNull()
    expect(referrerHost('https://example.com/play', 'example.com')).toBeNull()
    expect(referrerHost('https://www.example.com/play', 'example.com')).toBeNull()
  })

  it('never keeps path, query, or fragment data', () => {
    const host = referrerHost('https://telegram.me/proxy?server=1.2.3.4&port=443#secret', 'example.com')
    expect(host).toBe('telegram.me')
    expect(host).not.toContain('1.2.3.4')
  })
})

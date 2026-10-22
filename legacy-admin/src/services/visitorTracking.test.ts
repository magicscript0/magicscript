import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const getClientMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase')>()
  return {
    ...actual,
    getSupabaseClient: () => getClientMock(),
  }
})

import {
  HEARTBEAT_THROTTLE_MS,
  buildTrackingPayload,
  recordAdminLoginFailure,
  recordAdminLoginSuccess,
  recordGameLoginFailure,
  recordGameLoginSuccess,
  recordVisitorHeartbeat,
  resetVisitorTrackingForTests,
  sanitizeAppPath,
  trackSecurityEvent,
} from './visitorTracking'
import { resetVisitorIdentityForTests } from './visitorIdentity'

const OK_RESPONSE = { data: [{ event_id: 'e1', severity: 'normal', recent_failure_count: 0 }], error: null }

function lastPayload(): Record<string, unknown> {
  const call = rpcMock.mock.calls[rpcMock.mock.calls.length - 1]
  return call?.[1] as Record<string, unknown>
}

function trackCalls(): Array<Record<string, unknown>> {
  return rpcMock.mock.calls.filter((call) => call[0] === 'track_visitor_activity').map((call) => call[1] as Record<string, unknown>)
}

/** Lets fire-and-forget recorders (geo fetch → RPC) fully settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  rpcMock.mockReset()
  rpcMock.mockResolvedValue(OK_RESPONSE)
  getClientMock.mockReset()
  getClientMock.mockReturnValue({ rpc: rpcMock })
  // Tracking must NEVER use the network directly (the repo's static audit
  // forbids fetch in production source); the stub proves it at runtime too.
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  sessionStorage.clear()
  resetVisitorIdentityForTests()
  resetVisitorTrackingForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('payload shape — the privacy contract', () => {
  it('contains exactly the twelve validated RPC fields and nothing else', () => {
    const payload = buildTrackingPayload(
      { eventType: 'game_login_failure', reason: 'invalid_code', accountId: '123456789', path: '/' },
      '0f0f0f0f-1234-4abc-8def-000000000000',
    )
    expect(Object.keys(payload).sort()).toEqual([
      'p_account_id', 'p_browser', 'p_country_code', 'p_device_type', 'p_event_type',
      'p_new_session', 'p_os', 'p_path', 'p_reason', 'p_referrer_host', 'p_user_id', 'p_visitor_key',
    ])
    // No field name can even express a credential or a network identifier.
    for (const key of Object.keys(payload)) {
      expect(key).not.toMatch(/(password|token|secret|cookie|authoriz|credential)/i)
      expect(key).not.toMatch(/(^|_)ip($|_)/i)
    }
  })

  it('never carries secret-looking values even when the error text contains them', async () => {
    // A hostile/hypothetical error message must never leak into the payload.
    const cause = { kind: 'invalid_credentials', message: 'password "hunter2" rejected for admin@corp.com' }
    recordAdminLoginFailure(cause)
    await flush()
    const payload = lastPayload()
    expect(payload.p_reason).toBe('invalid_credentials')
    const serialized = JSON.stringify(payload).toLowerCase()
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('admin@corp.com')
    expect(serialized).not.toContain('password')
  })

  it('drops malformed account ids and normalizes the country', async () => {
    await trackSecurityEvent({ eventType: 'game_login_success', accountId: 'not-an-account', country: 'germany' })
    expect(lastPayload().p_account_id).toBeNull()
    expect(lastPayload().p_country_code).toBeNull()

    await trackSecurityEvent({ eventType: 'game_login_success', accountId: '1234567890', country: 'us' })
    expect(lastPayload().p_account_id).toBe('1234567890')
    expect(lastPayload().p_country_code).toBe('US')
  })

  it('sends the referrer host only for new sessions', () => {
    const fresh = buildTrackingPayload(
      { eventType: 'session_start', newSession: true, referrer: 'https://t.me/fox_script_vip?start=x' },
      '0f0f0f0f-1234-4abc-8def-000000000000',
    )
    expect(fresh.p_referrer_host).toBe('t.me')
    const later = buildTrackingPayload(
      { eventType: 'page_view', referrer: 'https://t.me/fox_script_vip?start=x' },
      '0f0f0f0f-1234-4abc-8def-000000000000',
    )
    expect(later.p_referrer_host).toBeNull()
  })
})

describe('path sanitization', () => {
  it('keeps only the four tracked app paths', () => {
    expect(sanitizeAppPath('/')).toBe('/')
    expect(sanitizeAppPath('/play')).toBe('/play')
    expect(sanitizeAppPath('/play/')).toBe('/play')
    expect(sanitizeAppPath('/admin')).toBe('/admin')
    expect(sanitizeAppPath('/login/admin')).toBe('/login/admin')
    expect(sanitizeAppPath('/some/other/page')).toBeNull()
    expect(sanitizeAppPath(null)).toBeNull()
  })
})

describe('fail-safe recording', () => {
  it('sends authentication events through the tracking RPC', async () => {
    await trackSecurityEvent({ eventType: 'game_login_failure', reason: 'invalid_code', accountId: '123456789' })
    expect(rpcMock).toHaveBeenCalledWith('track_visitor_activity', expect.objectContaining({
      p_event_type: 'game_login_failure',
      p_reason: 'invalid_code',
      p_account_id: '123456789',
    }))
    expect(lastPayload().p_visitor_key).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('resolves silently when the RPC fails — logging can never break a flow', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'row-level security violation', code: '42501' } })
    await expect(trackSecurityEvent({ eventType: 'admin_login_failure', reason: 'invalid_credentials' })).resolves.toBeUndefined()

    rpcMock.mockRejectedValue(new Error('network exploded'))
    await expect(trackSecurityEvent({ eventType: 'admin_login_failure', reason: 'network' })).resolves.toBeUndefined()
  })

  it('contains even synchronous RPC explosions inside the recorders', () => {
    rpcMock.mockImplementation(() => { throw new Error('boom') })
    expect(() => recordGameLoginSuccess('123456789')).not.toThrow()
    expect(() => recordGameLoginFailure('123456789', { kind: 'unavailable' })).not.toThrow()
    expect(() => recordAdminLoginSuccess('0f0f0f0f-1234-4abc-8def-000000000000')).not.toThrow()
    expect(() => recordAdminLoginFailure({ kind: 'rate_limited' })).not.toThrow()
  })

  it('is a complete no-op when Supabase is not configured', async () => {
    getClientMock.mockReturnValue(null)
    await trackSecurityEvent({ eventType: 'session_start', newSession: true })
    recordVisitorHeartbeat()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never performs its own network calls (the Supabase SDK is the only transport)', async () => {
    await trackSecurityEvent({ eventType: 'session_start', newSession: true })
    await trackSecurityEvent({ eventType: 'game_login_failure', reason: 'network' })
    recordVisitorHeartbeat()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('client-side throttling — no database chatter', () => {
  it('dedupes repeated informational events but always sends auth attempts', async () => {
    await trackSecurityEvent({ eventType: 'page_view', path: '/play' })
    await trackSecurityEvent({ eventType: 'page_view', path: '/play' })
    await trackSecurityEvent({ eventType: 'page_view', path: '/play' })
    expect(trackCalls()).toHaveLength(1)

    // A different path is a meaningful navigation.
    await trackSecurityEvent({ eventType: 'page_view', path: '/admin' })
    expect(trackCalls()).toHaveLength(2)

    // Every failed attempt matters for security scoring — never deduped.
    await trackSecurityEvent({ eventType: 'game_login_failure', reason: 'invalid_code' })
    await trackSecurityEvent({ eventType: 'game_login_failure', reason: 'invalid_code' })
    await trackSecurityEvent({ eventType: 'game_login_failure', reason: 'invalid_code' })
    expect(trackCalls()).toHaveLength(5)
  })

  it('throttles the heartbeat to at most one call per interval', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    recordVisitorHeartbeat()
    recordVisitorHeartbeat()
    recordVisitorHeartbeat()
    expect(rpcMock.mock.calls.filter((call) => call[0] === 'visitor_heartbeat')).toHaveLength(1)

    vi.setSystemTime(Date.now() + HEARTBEAT_THROTTLE_MS + 1_000)
    recordVisitorHeartbeat()
    expect(rpcMock.mock.calls.filter((call) => call[0] === 'visitor_heartbeat')).toHaveLength(2)
  })
})

describe('approximate country resolution (offline)', () => {
  it('records the explicit country when one is provided, normalized', async () => {
    await trackSecurityEvent({ eventType: 'session_start', newSession: true, country: 'de' })
    expect(lastPayload().p_country_code).toBe('DE')
  })

  it('resolves the country from the browser timezone without any network call', async () => {
    await trackSecurityEvent({ eventType: 'session_start', newSession: true })
    // Whatever the environment resolves to, it must be a valid ISO-2 or null,
    // and no fetch may happen.
    const country = lastPayload().p_country_code
    expect(country === null || /^[A-Z]{2}$/.test(String(country))).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('recorder → RPC mapping', () => {
  it('maps the game login outcome to the fixed event catalogue', async () => {
    recordGameLoginSuccess('123456789')
    await flush()
    expect(lastPayload().p_event_type).toBe('game_login_success')

    recordGameLoginFailure('123456789', { kind: 'unavailable', message: 'This Access Code is no longer active.' })
    await flush()
    const payload = lastPayload()
    expect(payload.p_event_type).toBe('game_login_failure')
    expect(payload.p_reason).toBe('unavailable')
    expect(JSON.stringify(payload)).not.toContain('no longer active')
  })

  it('maps the admin login outcome without the attempted email', async () => {
    recordAdminLoginSuccess('0f0f0f0f-1234-4abc-8def-000000000000')
    await flush()
    expect(lastPayload().p_event_type).toBe('admin_login_success')
    expect(lastPayload().p_user_id).toBe('0f0f0f0f-1234-4abc-8def-000000000000')

    recordAdminLoginFailure({ kind: 'profile_inactive', message: 'administrator profile is inactive' })
    await flush()
    expect(lastPayload().p_event_type).toBe('admin_login_failure')
    expect(lastPayload().p_reason).toBe('profile_inactive')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())
const channelMock = vi.hoisted(() => vi.fn())
const removeChannelMock = vi.hoisted(() => vi.fn())
const getClientMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase')>()
  const client = () => ({ rpc: rpcMock, from: fromMock, channel: channelMock, removeChannel: removeChannelMock })
  getClientMock.mockImplementation(client)
  return {
    ...actual,
    requireClient: () => client(),
    getSupabaseClient: () => getClientMock(),
  }
})

import {
  VISITOR_ONLINE_WINDOW_MS,
  VISITOR_RECENT_WINDOW_MS,
  getMonitoringSummary,
  listSecurityEvents,
  listVisitorSessions,
  pruneMonitoringData,
  rangeStartIso,
  sanitizeSearchTerm,
  securityEventLabel,
  subscribeToMonitoringChanges,
  visitorPresence,
  visitorShortLabel,
} from './securityMonitoring'
import type { SecurityEventRow, VisitorSessionRow } from '../types/supabase'

/** Chainable PostgREST-builder stub that records every filter call. */
interface ChainCall { method: string; args: unknown[] }

interface FakeChain {
  calls: ChainCall[]
  then: (resolve: (value: unknown) => unknown) => unknown
  [method: string]: unknown
}

function createChain(response: { data?: unknown; error?: unknown; count?: number | null }): FakeChain {
  const calls: ChainCall[] = []
  const chain: FakeChain = {
    calls,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve),
  }
  for (const method of ['eq', 'gte', 'lt', 'in', 'or', 'ilike', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }
  return chain
}

function mountChain(response: { data?: unknown; error?: unknown; count?: number | null }): FakeChain {
  const chain = createChain(response)
  fromMock.mockImplementation(() => ({ select: () => chain }))
  return chain
}

const VISITOR_ROW: VisitorSessionRow = {
  id: 'v1', visitor_key: 'a82f0f0f-1234-4abc-8def-000000000000', user_id: null, game_account_id: '123456789',
  first_seen_at: '2026-09-12T10:00:00.000Z', last_seen_at: '2026-09-12T10:04:00.000Z', session_count: 2,
  login_success_count: 1, login_failure_count: 3, country_code: 'DE', device_type: 'mobile',
  browser: 'Chrome', os: 'Android', last_path: '/play', referrer_host: 't.me',
}

const EVENT_ROW: SecurityEventRow = {
  id: 'e1', visitor_id: 'v1', visitor_key: VISITOR_ROW.visitor_key, event_type: 'game_login_failure',
  result: 'failure', reason: 'invalid_code', severity: 'warning', recent_failure_count: 2,
  user_id: null, game_account_id: '123456789', country_code: 'DE', device_type: 'mobile',
  browser: 'Chrome', os: 'Android', path: '/', created_at: '2026-09-12T10:03:00.000Z',
}

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
  channelMock.mockReset()
  removeChannelMock.mockReset()
  getClientMock.mockReset()
  getClientMock.mockImplementation(() => ({ rpc: rpcMock, from: fromMock, channel: channelMock, removeChannel: removeChannelMock }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('range and search helpers', () => {
  it('computes UTC-midnight and rolling window starts', () => {
    const now = new Date('2026-09-12T15:30:00.000Z')
    expect(rangeStartIso('today', now)).toBe('2026-09-12T00:00:00.000Z')
    expect(rangeStartIso('24h', now)).toBe('2026-09-11T15:30:00.000Z')
    expect(rangeStartIso('7d', now)).toBe('2026-09-05T15:30:00.000Z')
    expect(rangeStartIso('30d', now)).toBe('2026-08-13T15:30:00.000Z')
  })

  it('strips PostgREST metacharacters from search terms', () => {
    expect(sanitizeSearchTerm(' a82f,game_account_id.ilike.%x%() ')).toBe('a82fgameaccountidilikex')
    expect(sanitizeSearchTerm('!!!')).toBe('')
    expect(sanitizeSearchTerm('A82F-0F0F')).toBe('A82F-0F0F')
  })

  it('derives presence from the last-seen age', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z')
    expect(visitorPresence(new Date(now - 60_000).toISOString(), now)).toBe('online')
    expect(visitorPresence(new Date(now - VISITOR_ONLINE_WINDOW_MS - 1).toISOString(), now)).toBe('recent')
    expect(visitorPresence(new Date(now - VISITOR_RECENT_WINDOW_MS - 1).toISOString(), now)).toBe('offline')
    expect(visitorPresence('garbage', now)).toBe('offline')
  })

  it('renders short visitor labels and event labels', () => {
    expect(visitorShortLabel('a82f0f0f-1234-4abc-8def-000000000000')).toBe('#A82F')
    expect(securityEventLabel({ event_type: 'session_start', path: '/' })).toBe('دخل الموقع')
    expect(securityEventLabel({ event_type: 'page_view', path: '/play' })).toBe('فتح وحدة التحكم باللعبة')
    expect(securityEventLabel({ event_type: 'game_login_failure', path: '/' })).toBe('دخول فاشل للعبة')
  })
})

describe('event and visitor listing (admin reads)', () => {
  it('applies every filter to the query builder', async () => {
    const chain = mountChain({ data: [EVENT_ROW], error: null })
    const rows = await listSecurityEvents({
      range: '24h', result: 'failure', eventType: 'game_login_failure',
      severity: 'flagged', country: 'DE', device: 'mobile', search: 'a82f', limit: 50,
    })
    expect(rows).toEqual([EVENT_ROW])
    const methods = chain.calls.map((call) => call.method)
    expect(methods).toContain('gte')
    expect(chain.calls.some((call) => call.method === 'eq' && call.args[0] === 'result' && call.args[1] === 'failure')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'eq' && call.args[0] === 'event_type')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'in' && call.args[0] === 'severity')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'eq' && call.args[0] === 'country_code' && call.args[1] === 'DE')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'eq' && call.args[0] === 'device_type' && call.args[1] === 'mobile')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'or')).toBe(true)
    expect(chain.calls.some((call) => call.method === 'limit' && call.args[0] === 50)).toBe(true)
    // Newest first for the event stream.
    expect(chain.calls.some((call) => call.method === 'order' && call.args[0] === 'created_at')).toBe(true)
  })

  it('omits filters set to all', async () => {
    const chain = mountChain({ data: [], error: null })
    await listSecurityEvents({ range: '7d', result: 'all', eventType: 'all', severity: 'all', country: 'all', device: 'all' })
    const eqFilters = chain.calls.filter((call) => call.method === 'eq')
    expect(eqFilters).toHaveLength(0)
    expect(chain.calls.some((call) => call.method === 'gte')).toBe(true)
  })

  it('caps the page size at 500 rows', async () => {
    const chain = mountChain({ data: [], error: null })
    await listVisitorSessions({ range: '30d', limit: 10_000 })
    expect(chain.calls.some((call) => call.method === 'limit' && call.args[0] === 500)).toBe(true)
  })

  it('translates database failures into classified errors', async () => {
    mountChain({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(listSecurityEvents({ range: '24h' })).rejects.toThrow(/denied/i)
  })
})

describe('summary counters', () => {
  it('runs six index-backed head counts in parallel', async () => {
    const counts = [3, 5, 9, 12, 4, 2]
    let call = 0
    fromMock.mockImplementation(() => ({
      select: (_columns: string, options?: { count?: string; head?: boolean }) => {
        expect(options).toEqual({ count: 'exact', head: true })
        const chain = createChain({ count: counts[call], error: null })
        // Wrap `then` so filters resolve to the counted response.
        call += 1
        return chain
      },
    }))
    const summary = await getMonitoringSummary(new Date('2026-09-12T15:30:00.000Z'))
    expect(summary).toEqual({
      visitorsOnline: 3, activeSessions: 5, visitorsToday: 9,
      successfulLogins: 12, failedLogins: 4, flaggedEvents: 2,
    })
    expect(call).toBe(6)
  })
})

describe('retention cleanup', () => {
  it('calls the admin-only prune RPC and maps the result', async () => {
    rpcMock.mockResolvedValue({ data: [{ events_deleted: 42, visitors_deleted: 7 }], error: null })
    await expect(pruneMonitoringData(90)).resolves.toEqual({ eventsDeleted: 42, visitorsDeleted: 7 })
    expect(rpcMock).toHaveBeenCalledWith('prune_security_monitoring', { p_retention_days: 90 })
  })

  it('surfaces the RLS rejection when the caller is not an administrator', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only administrators can prune monitoring data.' } })
    await expect(pruneMonitoringData(90)).rejects.toThrow()
  })
})

describe('realtime subscription', () => {
  it('subscribes to inserts and visitor updates and cleans up the channel', () => {
    type OnArgs = [string, { event: string; schema: string; table: string }, () => void]
    const onMock = vi.fn((..._args: OnArgs) => channel)
    // The real supabase-js subscribe() hands back the same channel object.
    const subscribeMock = vi.fn(() => channel)
    const channel = { on: onMock, subscribe: subscribeMock }
    channelMock.mockReturnValue(channel)

    const onChange = vi.fn()
    const unsubscribe = subscribeToMonitoringChanges(onChange)
    expect(unsubscribe).toBeTypeOf('function')
    expect(channelMock).toHaveBeenCalledWith('security-monitoring')
    expect(subscribeMock).toHaveBeenCalled()
    const tables = onMock.mock.calls.map((call) => call[1].table)
    expect(tables).toEqual(['security_events', 'visitor_sessions', 'visitor_sessions'])

    // A realtime push reaches the callback.
    const pushHandler = onMock.mock.calls[0]?.[2]
    expect(pushHandler).toBeTypeOf('function')
    pushHandler?.()
    expect(onChange).toHaveBeenCalledTimes(1)

    unsubscribe?.()
    expect(removeChannelMock).toHaveBeenCalledWith(channel)
  })

  it('degrades to null (polling fallback) without a configured client', () => {
    getClientMock.mockReturnValue(null)
    expect(subscribeToMonitoringChanges(vi.fn())).toBeNull()
  })

  it('degrades to null when the realtime channel throws', () => {
    channelMock.mockImplementation(() => { throw new Error('realtime unavailable') })
    expect(subscribeToMonitoringChanges(vi.fn())).toBeNull()
  })
})

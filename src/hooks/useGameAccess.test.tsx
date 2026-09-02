import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGameAccess, GAME_ACCESS_HEARTBEAT_MS } from './useGameAccess'
import { checkGameAccess, redeemGameAccess, GameAccessError } from '../services/gameAccess'

vi.mock('../services/gameAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/gameAccess')>()
  return {
    ...actual,
    checkGameAccess: vi.fn(),
    redeemGameAccess: vi.fn(),
  }
})

const checkMock = vi.mocked(checkGameAccess)
const redeemMock = vi.mocked(redeemGameAccess)

const BASELINE = '2026-09-02T12:00:00.000Z'
const SESSION_KEY = 'ms.game.session.v1'

function iso(minutesFromBaseline: number): string {
  return new Date(Date.parse(BASELINE) + minutesFromBaseline * 60_000).toISOString()
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(BASELINE))
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('game access session', () => {
  it('starts without a session when nothing is stored', async () => {
    const { result } = renderHook(() => useGameAccess())
    await flush()
    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBeNull()
  })

  it('restores access on refresh only after server validation', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', accountId: '123456789' }))
    checkMock.mockResolvedValue({ valid: true, expiresAt: iso(30), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    expect(result.current.status).toBe('checking')
    await flush()

    expect(checkMock).toHaveBeenCalledWith('stored-token')
    expect(result.current.status).toBe('active')
    expect(result.current.accountId).toBe('123456789')
    expect(result.current.remainingMs).toBeCloseTo(30 * 60_000, -3)
  })

  it('denies restore when the stored session has expired server-side', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', accountId: '123456789' }))
    checkMock.mockResolvedValue({ valid: false, expiresAt: iso(-1), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('expired')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('denies restore when the code was revoked by an admin', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', accountId: '123456789' }))
    // Expiry is still in the future, but the code is revoked → invalid.
    checkMock.mockResolvedValue({ valid: false, expiresAt: iso(30), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('revoked')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('fails closed when access cannot be verified at all (unknown token)', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'unknown-token', accountId: '123456789' }))
    checkMock.mockResolvedValue(null)

    const { result } = renderHook(() => useGameAccess())
    await flush()

    expect(result.current.status).toBe('none')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('fails closed when the verification request itself fails on restore', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', accountId: '123456789' }))
    checkMock.mockRejectedValue(new GameAccessError('network', 'network down'))

    const { result } = renderHook(() => useGameAccess())
    await flush()

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('unverified')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('logs in with Account ID + Access Code and stores only the session token', async () => {
    redeemMock.mockResolvedValue({ token: 'fresh-token', expiresAt: iso(15), serverNow: BASELINE, accountId: '987654321' })

    const { result } = renderHook(() => useGameAccess())
    await flush()

    await act(async () => {
      await result.current.login('987654321', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    })

    expect(redeemMock).toHaveBeenCalledWith('987654321', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    expect(result.current.status).toBe('active')
    expect(result.current.accountId).toBe('987654321')
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') as { token?: string }
    expect(stored.token).toBe('fresh-token')
    // The plaintext access code must never be persisted.
    expect(sessionStorage.getItem(SESSION_KEY)).not.toContain('MS-ABCDE')
  })

  it('surfaces a clean failure when the code is already expired at login', async () => {
    redeemMock.mockRejectedValue(new GameAccessError('unavailable', 'This Access Code is no longer active. Ask for a fresh code.'))

    const { result } = renderHook(() => useGameAccess())
    await flush()

    await expect(
      act(async () => {
        await result.current.login('123456789', 'MS-EXPIRED-CODE')
      }),
    ).rejects.toThrow('no longer active')

    expect(result.current.status).toBe('none')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('automatically ends the session at the exact server-issued expiry', async () => {
    redeemMock.mockResolvedValue({ token: 'short-lived', expiresAt: new Date(Date.parse(BASELINE) + 20_000).toISOString(), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()
    await act(async () => {
      await result.current.login('123456789', 'MS-CODE')
    })
    expect(result.current.status).toBe('active')

    await act(async () => {
      vi.advanceTimersByTime(21_000)
    })

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('expired')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('drops an open session within one heartbeat after the admin revokes the code', async () => {
    redeemMock.mockResolvedValue({ token: 'session-token', expiresAt: iso(60), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()
    await act(async () => {
      await result.current.login('123456789', 'MS-CODE')
    })
    expect(result.current.status).toBe('active')

    // Admin revokes the code; the next server check reports it invalid.
    checkMock.mockResolvedValue({ valid: false, expiresAt: iso(60), serverNow: iso(0.5), accountId: '123456789' })

    await act(async () => {
      vi.advanceTimersByTime(GAME_ACCESS_HEARTBEAT_MS + 500)
      await Promise.resolve()
    })

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('revoked')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('survives a transient heartbeat network failure before the deadline', async () => {
    redeemMock.mockResolvedValue({ token: 'session-token', expiresAt: iso(60), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()
    await act(async () => {
      await result.current.login('123456789', 'MS-CODE')
    })

    checkMock.mockRejectedValue(new GameAccessError('network', 'network down'))
    await act(async () => {
      vi.advanceTimersByTime(GAME_ACCESS_HEARTBEAT_MS + 500)
      await Promise.resolve()
    })

    // Still inside the server-issued deadline → session survives until the
    // next successful check or the deadline itself.
    expect(result.current.status).toBe('active')
  })

  it('ends the session voluntarily when the user exits', async () => {
    redeemMock.mockResolvedValue({ token: 'session-token', expiresAt: iso(60), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()
    await act(async () => {
      await result.current.login('123456789', 'MS-CODE')
    })

    act(() => {
      result.current.exit()
    })

    expect(result.current.status).toBe('none')
    expect(result.current.reason).toBe('ended')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('keeps the countdown derived from the server clock', async () => {
    redeemMock.mockResolvedValue({ token: 'session-token', expiresAt: iso(10), serverNow: BASELINE, accountId: '123456789' })

    const { result } = renderHook(() => useGameAccess())
    await flush()
    await act(async () => {
      await result.current.login('123456789', 'MS-CODE')
    })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })

    expect(result.current.remainingMs).toBeLessThanOrEqual(9 * 60_000)
    expect(result.current.remainingMs).toBeGreaterThan(8 * 60_000)
  })
})

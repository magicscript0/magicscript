import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useM11Mirror } from './useM11Mirror'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'

const subscribeSyncMock = vi.hoisted(() => vi.fn())

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: vi.fn(),
}))

vi.mock('../services/m11', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/m11')>()),
  subscribeToM11Sync: subscribeSyncMock,
}))

import { isFirebaseConfigured } from '../services/firebase'

const isConfiguredMock = vi.mocked(isFirebaseConfigured)

afterEach(() => {
  cleanup()
  subscribeSyncMock.mockReset()
  isConfiguredMock.mockReset()
})

function attachListener() {
  const captured: {
    onUpdate?: (update: { evaluation: ReturnType<typeof evaluateM11Snapshot>; receivedAt: number }) => void
    onError?: (error: unknown) => void
  } = {}
  subscribeSyncMock.mockImplementation((handlers) => {
    captured.onUpdate = handlers.onUpdate
    captured.onError = handlers.onError
    return vi.fn()
  })
  return captured
}

describe('useM11Mirror — read-only sync lifecycle', () => {
  it('is idle and never subscribes when Firebase is not configured', () => {
    isConfiguredMock.mockReturnValue(false)
    const { result } = renderHook(() => useM11Mirror())
    expect(result.current.active).toBe(false)
    expect(result.current.status).toBe('idle')
    expect(result.current.evaluation).toBeNull()
    expect(subscribeSyncMock).not.toHaveBeenCalled()
  })

  it('is "syncing" until the first snapshot arrives, then reports it', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachListener()

    const { result } = renderHook(() => useM11Mirror())
    expect(result.current.status).toBe('syncing')

    const evaluation = evaluateM11Snapshot(null) // empty node
    act(() => captured.onUpdate?.({ evaluation, receivedAt: 1_700_000_000_000 }))
    expect(result.current.status).toBe('empty')
    expect(result.current.evaluation).toBe(evaluation)
    expect(result.current.lastUpdated).toBe(1_700_000_000_000)
    expect(result.current.error).toBeNull()
  })

  it('propagates incomplete/invalid/valid snapshot states', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachListener()
    const { result } = renderHook(() => useM11Mirror())

    act(() => captured.onUpdate?.({ evaluation: evaluateM11Snapshot({ m1: { m1: '1' } }), receivedAt: 1 }))
    expect(result.current.status).toBe('incomplete')

    act(() => captured.onUpdate?.({ evaluation: evaluateM11Snapshot({ m1: { m1: 1 } }), receivedAt: 2 }))
    expect(result.current.status).toBe('invalid')

    act(() =>
      captured.onUpdate?.({
        evaluation: evaluateM11Snapshot(
          Object.fromEntries([...Array(50).keys()].map((i) => [`m${i + 1}`, { [`m${i + 1}`]: '0' }])),
        ),
        receivedAt: 3,
      }),
    )
    expect(result.current.status).toBe('valid')
    expect(result.current.evaluation?.safeCount).toBe(0)
  })

  it('reports "error" when the listener fails and keeps the generator-independent state', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachListener()
    const { result } = renderHook(() => useM11Mirror())

    act(() => captured.onError?.(new Error('permission denied')))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('/m11')
  })

  it('reports "error" when attaching the listener throws', () => {
    isConfiguredMock.mockReturnValue(true)
    subscribeSyncMock.mockImplementation(() => {
      throw new Error('no database')
    })
    const { result } = renderHook(() => useM11Mirror())
    expect(result.current.status).toBe('error')
  })

  it('unsubscribes on unmount', () => {
    isConfiguredMock.mockReturnValue(true)
    const unsubscribe = vi.fn()
    subscribeSyncMock.mockReturnValue(unsubscribe)
    const { unmount } = renderHook(() => useM11Mirror())
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

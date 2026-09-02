import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useFirebaseConnection } from './useFirebaseConnection'

const subscribeMock = vi.hoisted(() => vi.fn())

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: vi.fn(),
  subscribeToConnectionState: subscribeMock,
}))

import { isFirebaseConfigured } from '../services/firebase'

const isConfiguredMock = vi.mocked(isFirebaseConfigured)

afterEach(() => {
  cleanup()
  subscribeMock.mockReset()
  isConfiguredMock.mockReset()
})

function attachSubscriber() {
  const captured: { onChange?: (connected: boolean) => void; onError?: (error: unknown) => void } = {}
  subscribeMock.mockImplementation((onChange, onError) => {
    captured.onChange = onChange
    captured.onError = onError
    return vi.fn() // unsubscribe
  })
  return captured
}

describe('useFirebaseConnection — state machine', () => {
  it('stays "unconfigured" and never subscribes when Firebase is not configured', () => {
    isConfiguredMock.mockReturnValue(false)
    const { result } = renderHook(() => useFirebaseConnection())
    expect(result.current).toBe('unconfigured')
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it('starts "connecting" when configured, then flips to "connected"', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachSubscriber()

    const { result } = renderHook(() => useFirebaseConnection())
    expect(result.current).toBe('connecting')

    act(() => captured.onChange?.(true))
    expect(result.current).toBe('connected')
  })

  it('reports "disconnected" when the SDK drops the connection', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachSubscriber()

    const { result } = renderHook(() => useFirebaseConnection())
    act(() => captured.onChange?.(true))
    act(() => captured.onChange?.(false))
    expect(result.current).toBe('disconnected')
  })

  it('reports "error" when the probe errors', () => {
    isConfiguredMock.mockReturnValue(true)
    const captured = attachSubscriber()

    const { result } = renderHook(() => useFirebaseConnection())
    act(() => captured.onError?.(new Error('permission denied')))
    expect(result.current).toBe('error')
  })

  it('reports "error" when the subscription itself throws', () => {
    isConfiguredMock.mockReturnValue(true)
    subscribeMock.mockImplementation(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useFirebaseConnection())
    expect(result.current).toBe('error')
  })

  it('unsubscribes on unmount', () => {
    isConfiguredMock.mockReturnValue(true)
    const unsubscribe = vi.fn()
    subscribeMock.mockReturnValue(unsubscribe)

    const { unmount } = renderHook(() => useFirebaseConnection())
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

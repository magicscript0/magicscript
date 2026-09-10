import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLocalClock } from './useLocalClock'
import { MINUTE_MS } from '../utils/localClock'

const BASELINE = new Date('2026-09-09T18:42:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASELINE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLocalClock', () => {
  it('starts with the current device time', () => {
    const { result } = renderHook(() => useLocalClock())
    expect(result.current.getTime()).toBe(BASELINE.getTime())
  })

  it('updates once per minute, not once per second', () => {
    const { result } = renderHook(() => useLocalClock())
    const initial = result.current.getTime()

    // Aligned first tick lands just past the next minute boundary.
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS + 50)
    })
    const afterFirst = result.current.getTime()
    expect(afterFirst).toBeGreaterThan(initial)

    // A single second within the same minute must not change the clock.
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.getTime()).toBe(afterFirst)

    // The next minute tick advances it again.
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS)
    })
    expect(result.current.getTime()).toBeGreaterThan(afterFirst)
  })
})

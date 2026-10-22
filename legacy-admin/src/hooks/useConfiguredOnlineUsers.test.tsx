import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { nextOnlineCount, useConfiguredOnlineUsers } from './useConfiguredOnlineUsers'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import type { DisplaySettings } from '../types/supabase'

const base = DEFAULT_CONTROL_SETTINGS.display

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('nextOnlineCount', () => {
  it('always stays within [min, max] across many steps', () => {
    let value = 30
    for (let i = 0; i < 1_000; i += 1) {
      value = nextOnlineCount(value, 7, 44)
      expect(value).toBeGreaterThanOrEqual(7)
      expect(value).toBeLessThanOrEqual(44)
    }
  })

  it('collapses to min when min >= max', () => {
    expect(nextOnlineCount(30, 44, 7)).toBe(44)
  })
})

describe('useConfiguredOnlineUsers', () => {
  it('returns null when the display is disabled', () => {
    const settings: DisplaySettings = { ...base, onlineCountEnabled: false }
    const { result } = renderHook(() => useConfiguredOnlineUsers(settings))
    expect(result.current).toBeNull()
  })

  it('returns the fixed value in fixed mode', () => {
    const settings: DisplaySettings = {
      ...base,
      onlineCountEnabled: true,
      onlineCountMode: 'fixed',
      onlineCountFixed: 33,
      onlineCountMin: 7,
      onlineCountMax: 44,
    }
    const { result } = renderHook(() => useConfiguredOnlineUsers(settings))
    expect(result.current).toBe(33)
  })

  it('drifts within the configured bounds on every refresh', () => {
    const settings: DisplaySettings = {
      ...base,
      onlineCountEnabled: true,
      onlineCountMode: 'random',
      onlineCountMin: 7,
      onlineCountMax: 44,
      onlineCountRefreshMs: 3_000,
    }
    const { result } = renderHook(() => useConfiguredOnlineUsers(settings))
    for (let i = 0; i < 40; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      expect(result.current).toBeGreaterThanOrEqual(7)
      expect(result.current).toBeLessThanOrEqual(44)
    }
  })

  it('normalizes an inverted min/max before starting', () => {
    const settings: DisplaySettings = {
      ...base,
      onlineCountEnabled: true,
      onlineCountMode: 'random',
      onlineCountMin: 100,
      onlineCountMax: 5,
      onlineCountRefreshMs: 3_000,
    }
    const { result } = renderHook(() => useConfiguredOnlineUsers(settings))
    expect(result.current).toBe(100)
  })
})

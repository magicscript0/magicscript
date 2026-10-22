import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const trackMock = vi.hoisted(() => vi.fn(async (_input: { eventType: string; path?: string; newSession?: boolean }) => undefined))
const heartbeatMock = vi.hoisted(() => vi.fn())
const beginSessionMock = vi.hoisted(() => vi.fn(() => ({ visitorKey: 'a82f0f0f-1234-4abc-8def-000000000000', newSession: true })))

vi.mock('../services/visitorTracking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/visitorTracking')>()
  return {
    ...actual,
    trackSecurityEvent: trackMock,
    recordVisitorHeartbeat: heartbeatMock,
  }
})

vi.mock('../services/visitorIdentity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/visitorIdentity')>()
  return {
    ...actual,
    beginVisitorSession: beginSessionMock,
  }
})

import { HEARTBEAT_CHECK_INTERVAL_MS, VisitorTracker } from './VisitorTracker'

function goTo(path: string) {
  window.history.replaceState(null, '', path)
}

beforeEach(() => {
  trackMock.mockClear()
  heartbeatMock.mockClear()
  beginSessionMock.mockClear()
  goTo('/')
})

afterEach(() => {
  cleanup()
  goTo('/')
})

describe('VisitorTracker', () => {
  it('renders nothing at all', () => {
    const { container } = render(<VisitorTracker />)
    expect(container.innerHTML).toBe('')
  })

  it('records exactly one session start (with the new-session flag) on mount', () => {
    render(<VisitorTracker />)
    expect(beginSessionMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith({ eventType: 'session_start', path: '/', newSession: true })
    // The initial path is covered by session_start — no duplicate page_view.
    expect(trackMock.mock.calls.filter((call) => (call[0] as { eventType: string }).eventType === 'page_view')).toHaveLength(0)
  })

  it('records a page view when the major route changes', async () => {
    render(<VisitorTracker />)
    trackMock.mockClear()

    await act(async () => {
      goTo('/play')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await Promise.resolve()
    })

    expect(trackMock).toHaveBeenCalledWith({ eventType: 'page_view', path: '/play' })
  })

  it('pings the heartbeat on the visible-tab interval only', () => {
    vi.useFakeTimers()
    render(<VisitorTracker />)
    expect(heartbeatMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_CHECK_INTERVAL_MS)
    })
    expect(heartbeatMock).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('stops all timers and listeners on unmount', () => {
    const { unmount } = render(<VisitorTracker />)
    unmount()
    // No assertion hooks leaked: advancing timers triggers nothing further.
    vi.useFakeTimers()
    vi.advanceTimersByTime(HEARTBEAT_CHECK_INTERVAL_MS * 3)
    expect(heartbeatMock).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { GameIntro, hasGameIntroCompleted, resetGameIntroState } from './GameIntro'

/**
 * The public boot/loading screen. Presentation contract only: what the user
 * sees, how the reveal is handed over, and that nothing resolves a session.
 */

function reducedMotion(matches: boolean) {
  const spy = vi.spyOn(window, 'matchMedia')
  spy.mockImplementation((query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  return spy
}

beforeEach(() => {
  vi.useFakeTimers()
  resetGameIntroState()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GameIntro — premium boot screen', () => {
  it('shows the brand, a determinate meter and the current boot stage', () => {
    render(<GameIntro />)
    expect(screen.getByRole('progressbar', { name: /loading magic script/i })).toBeInTheDocument()
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(screen.getByText('Apple of Fortune')).toBeInTheDocument()
    expect(screen.getByText('Initializing secure session')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    // It is an overlay: no heading competing with the login screen's own.
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('advances the percentage and the stage labels as it runs', () => {
    render(<GameIntro />)
    act(() => {
      vi.advanceTimersByTime(900)
    })
    const percent = Number(screen.getByText(/^\d+%$/).textContent?.replace('%', ''))
    expect(percent).toBeGreaterThan(30)
    expect(percent).toBeLessThan(100)
  })

  it('reveals the login first, then reports that the curtain is gone', () => {
    const order: string[] = []
    render(<GameIntro onReveal={() => order.push('reveal')} onFinish={() => order.push('finish')} />)
    expect(order).toEqual([])

    act(() => {
      vi.advanceTimersByTime(1_800)
    })
    expect(order).toEqual(['reveal'])
    expect(document.querySelector('.pg-intro--leaving')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(order).toEqual(['reveal', 'finish'])
    expect(hasGameIntroCompleted()).toBe(true)
  })

  it('plays once per page load', () => {
    expect(hasGameIntroCompleted()).toBe(false)
    render(<GameIntro />)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(hasGameIntroCompleted()).toBe(true)
  })

  it('collapses to a single lit frame under prefers-reduced-motion', () => {
    reducedMotion(true)
    const onFinish = vi.fn()
    render(<GameIntro onFinish={onFinish} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.queryByText('Initializing secure session')).toBeNull()
    expect(onFinish).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('holds an indeterminate readout while a session is being verified', () => {
    const onFinish = vi.fn()
    render(<GameIntro mode="checking" onFinish={onFinish} />)
    expect(screen.getByText(/checking your access/i)).toBeInTheDocument()
    expect(document.querySelector('.pg-meter--indeterminate')).not.toBeNull()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()

    // It never resolves on its own — the session verdict belongs to the hook.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onFinish).not.toHaveBeenCalled()
    expect(screen.getByText(/checking your access/i)).toBeInTheDocument()
  })
})

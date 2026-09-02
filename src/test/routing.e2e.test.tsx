/**
 * End-to-end routing regression suite.
 *
 * Unlike App.test.tsx this exercises the REAL routing hooks — usePathRoute and
 * usePageRoute are deliberately NOT mocked — so a redirect loop, a stale-path
 * mismatch, or a route that keeps rewriting history fails the build. Only the
 * two network-backed session hooks are stubbed, because jsdom has no Supabase.
 *
 * Every history mutation is recorded in `trace`, which is asserted on: a
 * settled route must stop writing to history.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import App from '../App'
import type { AdminProfile } from '../types/supabase'

const adminSessionMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useAdminSession', () => ({ useAdminSession: () => adminSessionMock() }))
const gameAccessMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useGameAccess', () => ({ useGameAccess: () => gameAccessMock() }))

const ADMIN: AdminProfile = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  email: 'admin@example.com',
  username: 'primary-admin',
  role: 'super_admin',
  active: true,
}

const trace: string[] = []
let pushSpy: ReturnType<typeof vi.spyOn>
let replaceSpy: ReturnType<typeof vi.spyOn>

function setAdmin(o: Record<string, unknown> = {}) {
  adminSessionMock.mockReturnValue({
    admin: null, loading: false, error: null,
    login: vi.fn().mockResolvedValue(ADMIN), logout: vi.fn().mockResolvedValue(undefined), ...o,
  })
}
function setGame(o: Record<string, unknown> = {}) {
  gameAccessMock.mockReturnValue({
    status: 'none', reason: null, accountId: null, expiresAt: null, remainingMs: 0,
    login: vi.fn().mockResolvedValue(undefined), exit: vi.fn(), ...o,
  })
}

function url() {
  return window.location.pathname + window.location.hash
}

/** Which screen is actually on the page right now. */
function screenName(): string {
  if (screen.queryByLabelText('Work email')) return 'ADMIN_LOGIN'
  if (screen.queryByLabelText('Account ID')) return 'GAME_LOGIN'
  if (screen.queryAllByText('System overview').length > 0) return 'ADMIN_DASHBOARD'
  if (screen.queryByText(/checking your access/i)) return 'GAME_LOADING'
  if (document.body.textContent?.includes('Apple of Fortune')) return 'GAME_CONSOLE'
  return 'UNKNOWN:' + (document.body.textContent ?? '').slice(0, 60)
}

beforeEach(() => {
  trace.length = 0
  window.history.replaceState(null, '', '/')
  setAdmin(); setGame()
  pushSpy = vi.spyOn(window.history, 'pushState')
  replaceSpy = vi.spyOn(window.history, 'replaceState')
  pushSpy.mockImplementation(function (this: History, ...args: unknown[]) {
    trace.push(`pushState -> ${String(args[2])}`)
    return History.prototype.pushState.apply(this, args as never)
  })
  replaceSpy.mockImplementation(function (this: History, ...args: unknown[]) {
    trace.push(`replaceState -> ${String(args[2])}`)
    return History.prototype.replaceState.apply(this, args as never)
  })
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('DIAGNOSTIC: direct navigation to every route', () => {
  for (const [path, admin, expected] of [
    ['/', false, 'GAME_LOGIN'],
    ['/play', false, 'GAME_LOGIN'],
    ['/login/admin', false, 'ADMIN_LOGIN'],
    ['/admin', false, 'ADMIN_LOGIN'],
    ['/login/admin', true, 'ADMIN_DASHBOARD'],
    ['/admin', true, 'ADMIN_DASHBOARD'],
  ] as const) {
    it(`direct hit ${path} (admin=${admin}) settles on ${expected}`, () => {
      window.history.replaceState(null, '', path)
      trace.length = 0
      if (admin) setAdmin({ admin: ADMIN })
      render(<App />)
      expect(screenName()).toBe(expected)
      // A settled route must not keep rewriting history.
      expect(trace.length).toBeLessThanOrEqual(2)
    })
  }
})

describe('DIAGNOSTIC: admin session state machine', () => {
  it('does NOT redirect while the session is still loading', () => {
    window.history.replaceState(null, '', '/admin')
    setAdmin({ loading: true })
    trace.length = 0
    render(<App />)
    expect(url()).toBe('/admin')
    expect(trace).toEqual([])
  })

  it('loading -> authorized keeps /admin and mounts the dashboard once', () => {
    window.history.replaceState(null, '', '/admin')
    setAdmin({ loading: true })
    const { rerender } = render(<App />)
    expect(url()).toBe('/admin')
    setAdmin({ admin: ADMIN })
    act(() => { rerender(<App />) })
    expect(url()).toBe('/admin')
    expect(screenName()).toBe('ADMIN_DASHBOARD')
  })

  it('sign-out from /admin lands on /login/admin and STOPS (no loop)', () => {
    window.history.replaceState(null, '', '/admin')
    setAdmin({ admin: ADMIN })
    const { rerender } = render(<App />)
    trace.length = 0
    setAdmin({ admin: null })
    act(() => { rerender(<App />) })
    act(() => { rerender(<App />) })
    act(() => { rerender(<App />) })
    expect(url()).toBe('/login/admin')
    expect(screenName()).toBe('ADMIN_LOGIN')
    expect(trace.filter((t) => t.includes('/login/admin')).length).toBeLessThanOrEqual(1)
  })
})

describe('DIAGNOSTIC: browser back / forward', () => {
  it('back from /admin to / renders the game login', () => {
    window.history.replaceState(null, '', '/')
    render(<App />)
    expect(screenName()).toBe('GAME_LOGIN')
    act(() => {
      window.history.pushState(null, '', '/login/admin')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screenName()).toBe('ADMIN_LOGIN')
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screenName()).toBe('GAME_LOGIN')
  })
})

describe('DIAGNOSTIC: admin hash sections do not leave the admin path', () => {
  it('keeps /admin in the pathname when a workspace section is opened', () => {
    window.history.replaceState(null, '', '/admin')
    setAdmin({ admin: ADMIN })
    render(<App />)
    expect(url()).toBe('/admin')
    act(() => {
      window.location.hash = 'codes'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(window.location.pathname).toBe('/admin')
  })
})

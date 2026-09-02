import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import type { AdminProfile } from './types/supabase'

const adminSessionMock = vi.hoisted(() => vi.fn())
vi.mock('./hooks/useAdminSession', () => ({
  useAdminSession: () => adminSessionMock(),
}))

const gameAccessMock = vi.hoisted(() => vi.fn())
vi.mock('./hooks/useGameAccess', () => ({
  useGameAccess: () => gameAccessMock(),
}))

const ADMIN: AdminProfile = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  email: 'admin@example.com',
  username: 'primary-admin',
  role: 'super_admin',
  active: true,
}

function setAdminSession(overrides: Record<string, unknown> = {}) {
  adminSessionMock.mockReturnValue({
    admin: null,
    loading: false,
    error: null,
    login: vi.fn().mockResolvedValue(ADMIN),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

function setGameAccess(overrides: Record<string, unknown> = {}) {
  gameAccessMock.mockReturnValue({
    status: 'none',
    reason: null,
    accountId: null,
    expiresAt: null,
    remainingMs: 0,
    login: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn(),
    ...overrides,
  })
}

function goTo(path: string) {
  window.history.replaceState(null, '', path)
}

beforeEach(() => {
  goTo('/')
  setAdminSession()
  setGameAccess()
})

afterEach(() => {
  cleanup()
  goTo('/')
})

describe('root route — the game experience is the default product', () => {
  it('shows the Game Login (not the admin dashboard) at "/"', () => {
    render(<App />)
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Access Code')).toBeInTheDocument()
    expect(screen.queryByLabelText('Work email')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
  })

  it('still shows the Game Login at "/" when an admin happens to be signed in', () => {
    setAdminSession({ admin: ADMIN })
    render(<App />)
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(screen.queryAllByText('System overview')).toHaveLength(0)
  })

  it('canonicalizes unknown paths to the Game Login', () => {
    goTo('/some/unknown/path')
    render(<App />)
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('opens the game console after a successful login at "/"', async () => {
    let state = {
      status: 'none' as 'none' | 'active',
      reason: null,
      accountId: null as string | null,
      expiresAt: null as number | null,
      remainingMs: 0,
    }
    gameAccessMock.mockImplementation(() => ({
      ...state,
      login: vi.fn(async () => {
        state = { status: 'active', reason: null, accountId: '123456789', expiresAt: Date.now() + 600_000, remainingMs: 600_000 }
      }),
      exit: vi.fn(),
    }))

    render(<App />)
    fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: '123456789' } })
    fireEvent.change(screen.getByLabelText('Access Code'), { target: { value: 'MS-ABCDE-FGHIJ-KLMNP-QRSTU' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enter game/i }))
      await Promise.resolve()
    })

    expect(window.location.pathname).toBe('/play')
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
  })
})

describe('protected Game Console route', () => {
  it('redirects "/play" to the Game Login without a session', () => {
    goTo('/play')
    render(<App />)
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('redirects "/play" to the Game Login when the session expired', () => {
    goTo('/play')
    setGameAccess({ status: 'none', reason: 'expired' })
    render(<App />)
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('previous access has expired')
    expect(window.location.pathname).toBe('/')
  })

  it('verifies the stored session before opening "/play"', () => {
    goTo('/play')
    setGameAccess({ status: 'checking' })
    render(<App />)
    expect(screen.getByText(/checking your access/i)).toBeInTheDocument()
  })

  it('opens Apple of Fortune at "/play" with a valid session', () => {
    goTo('/play')
    setGameAccess({ status: 'active', accountId: '123456789', expiresAt: Date.now() + 600_000, remainingMs: 600_000 })
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Account ID')).toBeNull()
  })
})

describe('protected Admin area', () => {
  it('redirects "/admin" to the admin login when unauthenticated', () => {
    goTo('/admin')
    render(<App />)
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login/admin')
  })

  it('shows the Supabase Auth screen at "/login/admin"', () => {
    goTo('/login/admin')
    render(<App />)
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByLabelText('Account ID')).toBeNull()
  })

  it('opens the dashboard for an active administrator at "/admin"', () => {
    goTo('/admin')
    setAdminSession({ admin: ADMIN })
    render(<App />)
    expect(screen.getAllByText('System overview').length).toBeGreaterThanOrEqual(1)
    // The new access-code management section is part of the admin workspace.
    expect(screen.getByRole('button', { name: /game access/i })).toBeInTheDocument()
  })

  it('moves a signed-in admin from "/login/admin" into the dashboard', () => {
    goTo('/login/admin')
    setAdminSession({ admin: ADMIN })
    render(<App />)
    expect(window.location.pathname).toBe('/admin')
    expect(screen.getAllByText('System overview').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps legacy "/#/section" bookmarks working under the admin area', () => {
    goTo('/#/codes')
    render(<App />)
    expect(window.location.pathname).toBe('/login/admin')
    expect(window.location.hash).toBe('#/codes')
  })

  it('denies the dashboard to a normal game user (no admin session)', () => {
    goTo('/admin')
    setGameAccess({ status: 'active', accountId: '123456789', remainingMs: 600_000 })
    render(<App />)
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
    expect(screen.queryAllByText('System overview')).toHaveLength(0)
  })

  it('shows a loading state while the admin session is bootstrapped', () => {
    goTo('/admin')
    setAdminSession({ loading: true })
    render(<App />)
    expect(screen.getByText(/securing workspace/i)).toBeInTheDocument()
  })
})

describe('admin access-code permission split', () => {
  it('hides Game Access navigation from operators but keeps it for admins', async () => {
    goTo('/admin')
    setAdminSession({ admin: { ...ADMIN, role: 'operator' } })
    render(<App />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('button', { name: /game access/i })).toBeNull()
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument()
  })
})

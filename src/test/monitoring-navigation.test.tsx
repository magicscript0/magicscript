/**
 * MONITORING CENTER NAVIGATION — the new sections are native to the
 * existing Admin Dashboard routing/permission system:
 *
 *   - the sidebar exposes a Monitoring group (admin roles only),
 *   - the hash routes #/visitors, #/auth, #/alerts render their pages
 *     through the SAME authorization gate as every other section,
 *   - legacy "/#/section" bookmarks keep working for the new sections,
 *   - operators (unchanged permission set) never see monitoring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import App from '../App'
import type { AdminProfile } from '../types/supabase'

const adminSessionMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useAdminSession', () => ({
  useAdminSession: () => adminSessionMock(),
}))

const gameAccessMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useGameAccess', () => ({
  useGameAccess: () => gameAccessMock(),
}))

const SUPER_ADMIN: AdminProfile = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  email: 'root@example.com',
  username: 'root-admin',
  role: 'super_admin',
  active: true,
}

function setAdminSession(overrides: Record<string, unknown> = {}) {
  adminSessionMock.mockReturnValue({
    admin: null,
    loading: false,
    error: null,
    login: vi.fn().mockResolvedValue(SUPER_ADMIN),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

function goTo(path: string) {
  window.history.replaceState(null, '', path)
}

beforeEach(() => {
  goTo('/admin')
  setAdminSession({ admin: SUPER_ADMIN })
  gameAccessMock.mockReturnValue({
    status: 'none',
    reason: null,
    accountId: null,
    expiresAt: null,
    remainingMs: 0,
    login: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  goTo('/')
})

describe('Monitoring group in the admin sidebar', () => {
  it('shows all three monitoring sections to super admins', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /visitor activity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /authentication activity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /security alerts/i })).toBeInTheDocument()
  })

  it('shows them to admins as well', () => {
    setAdminSession({ admin: { ...SUPER_ADMIN, role: 'admin' } })
    render(<App />)
    expect(screen.getByRole('button', { name: /visitor activity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /security alerts/i })).toBeInTheDocument()
  })

  it('hides monitoring from operators (existing role scope unchanged)', () => {
    setAdminSession({ admin: { ...SUPER_ADMIN, role: 'operator' } })
    render(<App />)
    expect(screen.queryByRole('button', { name: /visitor activity/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /authentication activity/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /security alerts/i })).toBeNull()
    // The operator workspace itself still works.
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('denies the monitoring routes to operators even via direct hash', async () => {
    goTo('/admin#/visitors')
    setAdminSession({ admin: { ...SUPER_ADMIN, role: 'operator' } })
    render(<App />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('heading', { name: /visitor activity/i })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Access restricted' })).toBeInTheDocument()
  })
})

describe('Monitoring routes', () => {
  it('renders the Visitor Activity section at #/visitors', () => {
    goTo('/admin#/visitors')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Visitor activity' })).toBeInTheDocument()
    // Both the topbar subtitle and the page description introduce the section.
    expect(screen.getAllByText(/Pseudonymous visitors/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the Authentication Activity section at #/auth', () => {
    goTo('/admin#/auth')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Authentication activity' })).toBeInTheDocument()
  })

  it('renders the Security Alerts section at #/alerts', () => {
    goTo('/admin#/alerts')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Security alerts' })).toBeInTheDocument()
    expect(screen.getByText(/Detection thresholds/i)).toBeInTheDocument()
  })

  it('keeps legacy "/#/section" bookmarks working for the new sections', () => {
    goTo('/#/alerts')
    render(<App />)
    expect(window.location.pathname).toBe('/admin')
    expect(window.location.hash).toBe('#/alerts')
    expect(screen.getByRole('heading', { name: 'Security alerts' })).toBeInTheDocument()
  })

  it('switches sections through the sidebar without a page reload', async () => {
    render(<App />)
    await act(async () => {
      screen.getByRole('button', { name: /authentication activity/i }).click()
      await Promise.resolve()
    })
    // usePageRoute writes the bare section hash (the reader accepts both forms).
    expect(window.location.hash).toBe('#auth')
    expect(screen.getByRole('heading', { name: 'Authentication activity' })).toBeInTheDocument()
  })
})

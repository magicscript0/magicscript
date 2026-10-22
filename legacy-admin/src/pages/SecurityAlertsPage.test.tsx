import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const listEventsMock = vi.hoisted(() => vi.fn())
const timelineMock = vi.hoisted(() => vi.fn())
const pruneMock = vi.hoisted(() => vi.fn())
const subscribeMock = vi.hoisted(() => vi.fn(() => null))
const recordActivityMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../services/securityMonitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/securityMonitoring')>()
  return {
    ...actual,
    listSecurityEvents: listEventsMock,
    getVisitorTimeline: timelineMock,
    pruneMonitoringData: pruneMock,
    subscribeToMonitoringChanges: subscribeMock,
  }
})

vi.mock('../services/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/activity')>()
  return { ...actual, recordActivity: recordActivityMock }
})

import { SecurityAlertsPage } from './SecurityAlertsPage'
import { ToastProvider } from '../components/ToastProvider'
import type { AdminProfile, SecurityEventRow } from '../types/supabase'

const ADMIN: AdminProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  username: 'admin',
  role: 'admin',
  active: true,
}

const VISITOR_A = 'a82f0f0f-1234-4abc-8def-000000000000'
const VISITOR_B = 'b1111111-2222-4222-8222-bbbbbbbbbbbb'

function flaggedEvent(overrides: Partial<SecurityEventRow> = {}): SecurityEventRow {
  return {
    id: 'e1',
    visitor_id: 'v1',
    visitor_key: VISITOR_A,
    event_type: 'game_login_failure',
    result: 'failure',
    reason: 'invalid_code',
    severity: 'warning',
    recent_failure_count: 2,
    user_id: null,
    game_account_id: '444555666',
    country_code: 'DE',
    device_type: 'desktop',
    browser: 'Chrome',
    os: 'Windows',
    path: '/',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  }
}

function renderPage() {
  return render(<ToastProvider><SecurityAlertsPage admin={ADMIN} /></ToastProvider>)
}

beforeEach(() => {
  listEventsMock.mockReset()
  timelineMock.mockReset()
  pruneMock.mockReset()
  subscribeMock.mockReset()
  recordActivityMock.mockClear()
  subscribeMock.mockReturnValue(null)
  timelineMock.mockResolvedValue([])
  pruneMock.mockResolvedValue({ eventsDeleted: 12, visitorsDeleted: 3 })
  listEventsMock.mockResolvedValue([
    // Visitor #B111: heavy repeated failures → high risk.
    flaggedEvent({ id: 'e1', visitor_key: VISITOR_B, severity: 'high_risk', recent_failure_count: 10, game_account_id: '444555666', created_at: new Date(Date.now() - 30_000).toISOString() }),
    flaggedEvent({ id: 'e2', visitor_key: VISITOR_B, severity: 'suspicious', recent_failure_count: 5, game_account_id: '444555666' }),
    // Visitor #A82F: mild repetition → warning.
    flaggedEvent({ id: 'e3', visitor_key: VISITOR_A, severity: 'warning', recent_failure_count: 2, game_account_id: '777888999' }),
  ])
})

afterEach(() => {
  cleanup()
})

describe('Security Alerts page', () => {
  it('renders the severity counters for the window', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())
    // Card labels plus the matching severity badges on the group rows.
    expect(screen.getAllByText('Warning').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Suspicious').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('High risk').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Visitors flagged')).toBeInTheDocument()
  })

  it('groups flagged events per pseudonymous visitor, worst severity first', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())
    expect(screen.getByText('Visitor #A82F')).toBeInTheDocument()
    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows[0]).toHaveTextContent('#B111')
    expect(rows[0]).toHaveTextContent('2 failed / 2 flagged events')
    expect(rows[1]).toHaveTextContent('#A82F')
    expect(screen.getByText(/accounts? 444555666/)).toBeInTheDocument()
  })

  it('narrows the list with the minimum-severity filter without refetching', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())
    const callsBefore = listEventsMock.mock.calls.length

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Minimum severity'), { target: { value: 'high_risk' } })
    })

    expect(screen.getByText('Visitor #B111')).toBeInTheDocument()
    expect(screen.queryByText('Visitor #A82F')).toBeNull()
    expect(listEventsMock.mock.calls.length).toBe(callsBefore)
  })

  it('expands a flagged visitor into its chronological timeline', async () => {
    timelineMock.mockResolvedValue([
      flaggedEvent({ id: 't1', event_type: 'session_start', result: 'info', reason: null, severity: 'normal', created_at: '2026-09-12T20:41:00.000Z' }),
      flaggedEvent({ id: 't2', created_at: '2026-09-12T20:43:00.000Z' }),
      flaggedEvent({ id: 't3', event_type: 'game_login_success', result: 'success', reason: null, severity: 'suspicious', created_at: '2026-09-12T20:45:00.000Z' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Visitor #B111'))

    await waitFor(() => expect(timelineMock).toHaveBeenCalledWith(VISITOR_B, 100))
    await waitFor(() => expect(screen.getByText('Entered website')).toBeInTheDocument())
    expect(screen.getByText('Successful game login')).toBeInTheDocument()
  })

  it('lists accounts targeted by repeated failed attempts', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Targeted accounts')).toBeInTheDocument())
    expect(screen.getByText('444555666')).toBeInTheDocument()
    expect(screen.getByText('2 failed attempts')).toBeInTheDocument()
    // A single-failure account is not presented as targeted.
    expect(screen.queryByText('777888999')).toBeNull()
  })

  it('documents the detection thresholds and the no-single-failure rule', () => {
    renderPage()
    expect(screen.getByText(/A single failed login always stays/i)).toBeInTheDocument()
    expect(screen.getByText(/No automatic bans/i)).toBeInTheDocument()
  })

  it('runs the audited 90-day retention cleanup behind a confirmation', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /run 90-day cleanup/i }))
    expect(screen.getByText(/Delete monitoring data older than 90 days\?/i)).toBeInTheDocument()
    expect(pruneMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete old data/i }))
      await Promise.resolve()
    })

    await waitFor(() => expect(pruneMock).toHaveBeenCalledWith(90))
    await waitFor(() => expect(recordActivityMock).toHaveBeenCalledWith(
      ADMIN.id,
      'PRUNE_SECURITY_MONITORING',
      expect.objectContaining({ retention_days: 90, events_deleted: 12, visitors_deleted: 3 }),
    ))
  })

  it('surfaces a friendly error when the cleanup is denied', async () => {
    pruneMock.mockRejectedValue(new Error('Supabase denied this operation.'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Visitor #B111')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /run 90-day cleanup/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete old data/i }))
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText(/could not be pruned|denied/i)).toBeInTheDocument())
  })
})

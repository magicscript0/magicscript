import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const listVisitorsMock = vi.hoisted(() => vi.fn())
const summaryMock = vi.hoisted(() => vi.fn())
const timelineMock = vi.hoisted(() => vi.fn())
const subscribeMock = vi.hoisted(() => vi.fn((): (() => void) | null => null))

vi.mock('../services/securityMonitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/securityMonitoring')>()
  return {
    ...actual,
    listVisitorSessions: listVisitorsMock,
    getMonitoringSummary: summaryMock,
    getVisitorTimeline: timelineMock,
    subscribeToMonitoringChanges: subscribeMock,
  }
})

import { VisitorsPage } from './VisitorsPage'
import type { SecurityEventRow, VisitorSessionRow } from '../types/supabase'

const VISITOR_KEY = 'a82f0f0f-1234-4abc-8def-000000000000'

function visitorRow(overrides: Partial<VisitorSessionRow> = {}): VisitorSessionRow {
  return {
    id: 'v1',
    visitor_key: VISITOR_KEY,
    user_id: null,
    game_account_id: '123456789',
    first_seen_at: new Date(Date.now() - 3_600_000).toISOString(),
    last_seen_at: new Date(Date.now() - 60_000).toISOString(),
    session_count: 2,
    login_success_count: 1,
    login_failure_count: 3,
    country_code: 'DE',
    device_type: 'mobile',
    browser: 'Chrome',
    os: 'Android',
    last_path: '/play',
    referrer_host: 't.me',
    ...overrides,
  }
}

function eventRow(overrides: Partial<SecurityEventRow> = {}): SecurityEventRow {
  return {
    id: 'e1',
    visitor_id: 'v1',
    visitor_key: VISITOR_KEY,
    event_type: 'session_start',
    result: 'info',
    reason: null,
    severity: 'normal',
    recent_failure_count: 0,
    user_id: null,
    game_account_id: null,
    country_code: 'DE',
    device_type: 'mobile',
    browser: 'Chrome',
    os: 'Android',
    path: '/',
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    ...overrides,
  }
}

const SUMMARY = {
  visitorsOnline: 41,
  activeSessions: 42,
  visitorsToday: 43,
  successfulLogins: 44,
  failedLogins: 45,
  flaggedEvents: 46,
}

beforeEach(() => {
  listVisitorsMock.mockReset()
  summaryMock.mockReset()
  timelineMock.mockReset()
  subscribeMock.mockClear()
  subscribeMock.mockReturnValue(null)
  listVisitorsMock.mockResolvedValue([visitorRow()])
  summaryMock.mockResolvedValue(SUMMARY)
  timelineMock.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

describe('Visitor Activity page', () => {
  it('renders the privacy-safe summary cards', async () => {
    render(<VisitorsPage />)
    await waitFor(() => expect(screen.getByText('الزوار المتصلون')).toBeInTheDocument())
    expect(screen.getByText('الجلسات النشطة')).toBeInTheDocument()
    expect(screen.getByText('زوار اليوم')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('41')).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('43')).toBeInTheDocument()
    })
  })

  it('lists visitors with pseudonymous labels and technical metadata only', async () => {
    render(<VisitorsPage />)
    await waitFor(() => expect(screen.getByText('#A82F')).toBeInTheDocument())
    // The status badge (plus the same word in the status filter options).
    expect(screen.getAllByText('متصل الآن').length).toBeGreaterThanOrEqual(1)
    // The country cell (plus the derived country filter option).
    expect(screen.getAllByText('DE').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('حساب 123456789')).toBeInTheDocument()
    expect(screen.getByText('وحدة التحكم باللعبة')).toBeInTheDocument() // last_path '/play'
    expect(screen.getByText('عبر t.me')).toBeInTheDocument()
    // The raw visitor key is never rendered in full in the table cell text.
    expect(screen.queryByText(VISITOR_KEY)).toBeNull()
  })

  it('refetches with the selected filters', async () => {
    render(<VisitorsPage />)
    await waitFor(() => expect(listVisitorsMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('التصفية حسب المدة'), { target: { value: '7d' } })
    })
    await waitFor(() => expect(listVisitorsMock).toHaveBeenLastCalledWith(expect.objectContaining({ range: '7d' })))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('التصفية حسب حالة الجلسة'), { target: { value: 'online' } })
    })
    await waitFor(() => expect(listVisitorsMock).toHaveBeenLastCalledWith(expect.objectContaining({ presence: 'online' })))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('البحث في الزوار'), { target: { value: 'a82f' } })
    })
    await waitFor(() => expect(listVisitorsMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'a82f' })))
  })

  it('opens the chronological timeline for a selected visitor', async () => {
    timelineMock.mockResolvedValue([
      eventRow({ id: 'e1', event_type: 'session_start', path: '/', created_at: '2026-09-12T20:41:00.000Z' }),
      eventRow({ id: 'e2', event_type: 'game_login_failure', result: 'failure', reason: 'invalid_code', severity: 'warning', recent_failure_count: 2, created_at: '2026-09-12T20:43:00.000Z' }),
      eventRow({ id: 'e3', event_type: 'game_login_failure', result: 'failure', reason: 'invalid_code', severity: 'warning', recent_failure_count: 3, created_at: '2026-09-12T20:44:00.000Z' }),
      eventRow({ id: 'e4', event_type: 'game_login_success', result: 'success', created_at: '2026-09-12T20:45:00.000Z' }),
    ])
    render(<VisitorsPage />)
    await waitFor(() => expect(screen.getByText('#A82F')).toBeInTheDocument())

    fireEvent.click(screen.getByText('#A82F'))

    await waitFor(() => expect(timelineMock).toHaveBeenCalledWith(VISITOR_KEY, 150))
    await waitFor(() => expect(screen.getByText('دخل الموقع')).toBeInTheDocument())
    expect(screen.getAllByText('دخول فاشل للعبة').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('دخول ناجح للعبة')).toBeInTheDocument()
    expect(screen.getAllByText(/\(كود غير صحيح\)/).length).toBeGreaterThanOrEqual(1)
    // The timeline header shows the pseudonym, matching "الزائر #A82F".
    expect(screen.getByText(/الزائر #A82F — سجل النشاط/)).toBeInTheDocument()
  })

  it('shows a retryable inline error when monitoring reads fail', async () => {
    listVisitorsMock.mockRejectedValue(new Error('Supabase could not be reached'))
    summaryMock.mockRejectedValue(new Error('Supabase could not be reached'))
    render(<VisitorsPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    listVisitorsMock.mockResolvedValue([visitorRow()])
    summaryMock.mockResolvedValue(SUMMARY)
    const callsBefore = listVisitorsMock.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }))
    })
    await waitFor(() => expect(listVisitorsMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('subscribes to realtime updates and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    subscribeMock.mockReturnValue(unsubscribe)
    render(<VisitorsPage />)
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled())
    expect(screen.getByText('مباشر')).toBeInTheDocument()
    cleanup()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

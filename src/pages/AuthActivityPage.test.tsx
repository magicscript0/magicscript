import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const listEventsMock = vi.hoisted(() => vi.fn())
const summaryMock = vi.hoisted(() => vi.fn())
const subscribeMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('../services/securityMonitoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/securityMonitoring')>()
  return {
    ...actual,
    listSecurityEvents: listEventsMock,
    getMonitoringSummary: summaryMock,
    subscribeToMonitoringChanges: subscribeMock,
  }
})

import { AuthActivityPage } from './AuthActivityPage'
import type { SecurityEventRow } from '../types/supabase'

const VISITOR_KEY = 'a82f0f0f-1234-4abc-8def-000000000000'

function eventRow(overrides: Partial<SecurityEventRow> = {}): SecurityEventRow {
  return {
    id: 'e1',
    visitor_id: 'v1',
    visitor_key: VISITOR_KEY,
    event_type: 'game_login_failure',
    result: 'failure',
    reason: 'invalid_code',
    severity: 'normal',
    recent_failure_count: 1,
    user_id: null,
    game_account_id: '123456789',
    country_code: 'DE',
    device_type: 'mobile',
    browser: 'Chrome',
    os: 'Android',
    path: '/',
    created_at: new Date(Date.now() - 60_000).toISOString(),
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
  listEventsMock.mockReset()
  summaryMock.mockReset()
  subscribeMock.mockReset()
  subscribeMock.mockReturnValue(null)
  summaryMock.mockResolvedValue(SUMMARY)
  listEventsMock.mockResolvedValue([
    eventRow({ id: 'e1' }),
    eventRow({
      id: 'e2',
      event_type: 'game_login_failure',
      reason: 'invalid_code',
      severity: 'warning',
      recent_failure_count: 2,
      created_at: new Date(Date.now() - 30_000).toISOString(),
    }),
    eventRow({
      id: 'e3',
      event_type: 'admin_login_success',
      result: 'success',
      reason: null,
      game_account_id: null,
      user_id: '11111111-1111-1111-1111-111111111111',
      path: '/login/admin',
      created_at: new Date(Date.now() - 10_000).toISOString(),
    }),
    // Session/page milestones belong to the Visitor timeline, not this page.
    eventRow({ id: 'e4', event_type: 'page_view', result: 'info', reason: null, path: '/play' }),
  ])
})

afterEach(() => {
  cleanup()
})

describe('Authentication Activity page', () => {
  it('renders the authentication summary cards', async () => {
    render(<AuthActivityPage />)
    await waitFor(() => expect(screen.getByText('محاولات ناجحة')).toBeInTheDocument())
    expect(screen.getByText('محاولات فاشلة')).toBeInTheDocument()
    expect(screen.getByText('محاولات مريبة')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('44')).toBeInTheDocument()
      expect(screen.getByText('45')).toBeInTheDocument()
      expect(screen.getByText('46')).toBeInTheDocument()
    })
  })

  it('lists authentication events with outcomes, categories, and context', async () => {
    render(<AuthActivityPage />)
    await waitFor(() => expect(screen.getAllByText('دخول فاشل للعبة')).toHaveLength(2))
    expect(screen.getByText('دخول ناجح للوحة التحكم')).toBeInTheDocument()
    // Non-authentication events stay out of this section.
    expect(screen.queryByText('فتح وحدة التحكم باللعبة')).toBeNull()
    // Visitor pseudonym and account identifier, never a credential.
    expect(screen.getAllByText('#A82F').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText('123456789').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('فشل').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('نجاح')).toBeInTheDocument()
    expect(screen.getAllByText('كود غير صحيح').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('تحذير')).toBeInTheDocument()
  })

  it('refetches with result, event type, and suspicious-only filters', async () => {
    render(<AuthActivityPage />)
    await waitFor(() => expect(listEventsMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('التصفية حسب النتيجة'), { target: { value: 'failure' } })
    })
    await waitFor(() => expect(listEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failure' })))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('التصفية حسب نوع الحدث'), { target: { value: 'admin_login_failure' } })
    })
    await waitFor(() => expect(listEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'admin_login_failure' })))

    await act(async () => {
      fireEvent.change(screen.getByLabelText('التصفية حسب المدة'), { target: { value: '30d' } })
    })
    await waitFor(() => expect(listEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ range: '30d' })))

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/النشاط المريب فقط/))
    })
    await waitFor(() => expect(listEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'flagged' })))
  })

  it('states the privacy contract: categories only, never entered secrets', () => {
    render(<AuthActivityPage />)
    expect(screen.getByText(/كلمة المرور أو كود الدخول المُدخل لا يُرسل ولا يُخزن ولا يُعرض أبدًا/)).toBeInTheDocument()
    expect(screen.getByText(/لا تُسجل أي كلمات مرور أو أكواد مُدخلة في أي مكان/)).toBeInTheDocument()
  })
})

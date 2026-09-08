/**
 * PUBLIC GAME FLOW — Loading screen → Game Login → Apple of Fortune board.
 *
 * The presentation redesign must not disturb the flow or the data path, so
 * this suite drives the real App at `/` through the whole sequence:
 *
 *   boot curtain plays → dissolves into the login → a code redeems (session
 *   hook stubbed, jsdom has no Supabase) → `/play` renders the board, which
 *   still mirrors whatever the REAL /m11 read path hands it.
 *
 * Only `firebase/database` is mocked, and only to feed a known snapshot
 * through the existing `onValue` listener — the same technique the Firebase
 * execution-path tests use. Cell-by-cell equality against the fixture is what
 * proves the redesign is display-only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { resetGameIntroState } from '../components/GameIntro'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS } from '../config/game'

const gameAccessMock = vi.hoisted(() => vi.fn())
const adminSessionMock = vi.hoisted(() => vi.fn())
const onValueMock = vi.hoisted(() => vi.fn())
const updateMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const liveValue = vi.hoisted(() => ({ current: null as null | ((snapshot: { val: () => unknown }) => void) }))

vi.mock('../hooks/useAdminSession', () => ({ useAdminSession: () => adminSessionMock() }))
vi.mock('../hooks/useGameAccess', () => ({ useGameAccess: () => gameAccessMock() }))
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: unknown) => ({ path: `${path}` }),
  update: updateMock,
  onValue: onValueMock,
}))
vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => true,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => ({ fake: true }),
}))

/** Raw /m11 fixture in the exact Firebase wire shape { mN: { mN: "0"|"1" } }. */
function rawSnapshot(safeKeys: readonly string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of M_KEYS) raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  return raw
}

function deterministicSafeKeys(): string[] {
  const safe = ['m1', 'm3']
  for (let n = 6; n <= 50; n += 1) if (n % 2 === 0) safe.push(`m${n}`)
  return safe
}

function emitSnapshot(safeKeys: readonly string[]) {
  act(() => {
    liveValue.current?.({ val: () => rawSnapshot(safeKeys) })
  })
}

function revealedBoard(): Record<string, string> {
  const board: Record<string, string> = {}
  const cells = screen.getAllByRole('img')
  expect(cells).toHaveLength(50)
  for (const cell of cells) {
    const match = (cell.getAttribute('aria-label') ?? '').match(/^Position (m\d+) — (safe|bomb)$/)
    expect(match, `unexpected board cell label "${cell.getAttribute('aria-label')}"`).not.toBeNull()
    board[match![1]] = match![2]
  }
  return board
}

function container(): HTMLElement {
  return document.getElementById('root') ?? document.body
}

function veil(): Element | null {
  return document.querySelector('.pg-veil')
}

beforeEach(() => {
  vi.useFakeTimers()
  resetGameIntroState()
  window.history.replaceState(null, '', '/')
  liveValue.current = null
  updateMock.mockClear()
  onValueMock.mockClear()
  adminSessionMock.mockReturnValue({ admin: null, loading: false, error: null, login: vi.fn(), logout: vi.fn() })
  gameAccessMock.mockReturnValue({
    status: 'none',
    reason: null,
    accountId: null,
    expiresAt: null,
    remainingMs: 0,
    login: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn(),
  })
  onValueMock.mockImplementation((_ref: unknown, onData: (snapshot: { val: () => unknown }) => void) => {
    liveValue.current = onData
    return () => undefined
  })
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

describe('flow 1 — the boot curtain hands the stage to the login', () => {
  it('loads over the login, then dissolves without touching the form', () => {
    render(<App />)

    // Curtain up: the loading screen owns the viewport…
    expect(screen.getByRole('progressbar', { name: /loading magic script/i })).toBeInTheDocument()
    // …and the login is already mounted underneath, held closed.
    expect(veil()?.className).toContain('pg-veil')
    expect(veil()?.className).not.toContain('pg-veil--open')
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_800)
    })
    // Reveal begins: the login rises while the curtain dissolves.
    expect(veil()?.className).toContain('pg-veil--open')

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('button', { name: /enter game/i })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('keeps validation untouched behind the new surface', () => {
    render(<App />)
    act(() => {
      vi.advanceTimersByTime(2_400)
    })

    fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: '12345678' } })
    fireEvent.change(screen.getByLabelText('Access Code'), { target: { value: 'MS-ABCDE-FGHIJ-KLMNP-QRSTU' } })
    fireEvent.click(screen.getByRole('button', { name: /enter game/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/must be 9–11 digits/i)
  })
})

describe('flow 2 — a redeemed session opens the premium board', () => {
  it('logs in, mirrors /m11 exactly, and reveals it row by row', async () => {
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
    act(() => {
      vi.advanceTimersByTime(2_400)
    })

    fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: '123456789' } })
    fireEvent.change(screen.getByLabelText('Access Code'), { target: { value: 'MS-ABCDE-FGHIJ-KLMNP-QRSTU' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enter game/i }))
      await Promise.resolve()
    })

    expect(window.location.pathname).toBe('/play')
    expect(container().textContent).toContain('Apple of Fortune')
    expect(screen.getByLabelText('Prediction board')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    // Displaying a mirrored board must never generate or publish anything.
    expect(updateMock).not.toHaveBeenCalled()

    const safe = deterministicSafeKeys()
    emitSnapshot(safe)

    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    for (let row = 0; row < GRID_ROWS; row += 1) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
      })
    }

    const board = revealedBoard()
    for (const key of M_KEYS) {
      expect(board[key], `${key}: the redesigned board must equal Firebase /m11`).toBe(safe.includes(key) ? 'safe' : 'bomb')
    }
    expect(updateMock).not.toHaveBeenCalled()
  })
})

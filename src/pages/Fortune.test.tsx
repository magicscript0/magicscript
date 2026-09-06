import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Fortune } from './Fortune'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS } from '../config/game'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'

const isConfiguredMock = vi.hoisted(() => vi.fn(() => true))
const subscribeMock = vi.hoisted(() => vi.fn())
const publishMock = vi.hoisted(() => vi.fn())

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: isConfiguredMock,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => ({ fake: true }),
}))

vi.mock('../services/m11', () => ({
  subscribeToM11Sync: subscribeMock,
  publishDemoRound: publishMock,
}))

type SyncHandlers = {
  onUpdate?: (update: {
    evaluation: ReturnType<typeof evaluateM11Snapshot>
    receivedAt: number
  }) => void
  onError?: (error: unknown) => void
}

const listener = { current: null as SyncHandlers | null }

function rawSnapshot(safeKeys: readonly string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of M_KEYS) {
    raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return raw
}

/** Recognizable deterministic fixture: m1=1, m2=0, m3=1, m4=0, m5=0,
 * then even mN are safe (m6,m8,…) and odd mN from m7 are broken. */
function deterministicSafeKeys(): string[] {
  const safe = ['m1', 'm3']
  for (let n = 6; n <= 50; n += 1) {
    if (n % 2 === 0) safe.push(`m${n}`)
  }
  return safe
}

function emitSnapshot(safeKeys: readonly string[], receivedAt = 1_000) {
  act(() => {
    listener.current?.onUpdate?.({
      evaluation: evaluateM11Snapshot(rawSnapshot(safeKeys)),
      receivedAt,
    })
  })
}

function revealAll() {
  for (let i = 0; i < GRID_ROWS; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

function revealedCellMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cell of screen.getAllByRole('img')) {
    const label = cell.getAttribute('aria-label') ?? ''
    const match = label.match(/^Position (m\d+) — (safe|bomb)$/)
    expect(match, `unexpected board cell label "${label}"`).not.toBeNull()
    map[match![1]] = match![2]
  }
  return map
}

beforeEach(() => {
  vi.useFakeTimers()
  isConfiguredMock.mockReset().mockReturnValue(true)
  subscribeMock.mockReset()
  publishMock.mockReset()
  listener.current = null
  subscribeMock.mockImplementation((handlers: SyncHandlers) => {
    listener.current = handlers
    return () => undefined
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Apple of Fortune public board — Firebase /m11 live mirror', () => {
  it('brands the experience as Apple of Fortune under MAGIC SCRIPT', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(document.title).toBe('Apple of Fortune')
  })

  it('shows the server-derived countdown and the account id', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByLabelText(/access time remaining/i)).toBeInTheDocument()
  })

  it('subscribes to Firebase /m11 and renders every m1…m50 value 1:1', () => {
    const safe = deterministicSafeKeys()
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    emitSnapshot(safe)

    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    revealAll()

    const board = revealedCellMap()
    expect(Object.keys(board)).toHaveLength(50)
    for (const key of M_KEYS) {
      const expected = safe.includes(key) ? 'safe' : 'bomb'
      expect(board[key], `${key}: board must equal Firebase /m11 ${key}`).toBe(expected)
    }
    // The public board is a read-only mirror: it never publishes a prediction.
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('updates cell 17 immediately when Firebase changes m17 from "0" to "1"', () => {
    const initial = deterministicSafeKeys() // m17 is "0" in this fixture
    expect(initial).not.toContain('m17')

    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(initial, 1_000)

    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    revealAll()
    expect(screen.getByLabelText('Position m17 — bomb')).toBeInTheDocument()

    // Firebase updates m17: "0" → "1". No local generator, no publish.
    emitSnapshot([...initial, 'm17'], 2_000)

    expect(screen.getByLabelText('Position m17 — safe')).toBeInTheDocument()
    expect(screen.queryByLabelText('Position m17 — bomb')).toBeNull()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('never uses a local prediction generator to display the current Firebase round', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Fortune.tsx'), 'utf-8')
    expect(source).not.toMatch(/generateDemoRound|nodeToRows|publishDemoRound|validateM11Node|START_SIMULATION_MS/)
  })

  it('shows an explicit loading state instead of inventing a local round', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getAllByText(/Loading the current game/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /new round/i })).toBeNull()
    expect(subscribeMock).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit unavailable state when Firebase is not configured', () => {
    isConfiguredMock.mockReturnValue(false)
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getAllByText(/current game is unavailable/i).length).toBeGreaterThan(0)
    expect(subscribeMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /new round/i })).toBeNull()
  })

  it('never exposes control-plane terminology to the end user', () => {
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(deterministicSafeKeys())
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/firebase|supabase|control plane|round sync|write policy|read only|read-only|super admin|primary-admin|\brls\b|database|\/m11|diagnostic|mirror|payload/i)
  })

  it('keeps the whole board on screen through the no-scroll stage layout', () => {
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(container.querySelector('.fortune-screen')).not.toBeNull()
    expect(container.querySelector('.fortune-stage')).not.toBeNull()
    expect(container.querySelector('.fortune-board')).not.toBeNull()
  })

  it('returns to the Game Login when the player exits', () => {
    const onExit = vi.fn()
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: /exit game/i }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

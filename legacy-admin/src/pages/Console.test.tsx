import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Console } from './Console'
import {
  GRID_ROWS,
  REVEAL_ROW_DELAY_MS,
  START_SIMULATION_MS,
} from '../config/game'
import { generateDemoRound } from '../utils/generator'

beforeEach(() => {
  vi.useFakeTimers()
})

// Deterministic offline demo mode for these tests, regardless of any local .env.
vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => false,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => {
    throw new Error('Firebase is intentionally not configured in Console tests')
  },
}))


// Publishing must NEVER happen in offline mode (and never on these paths).
const publishMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../services/m11', () => ({
  subscribeToM11Sync: () => () => undefined,
  publishDemoRound: publishMock,
}))

afterEach(() => {
  publishMock.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function startRound() {
  fireEvent.click(screen.getByRole('button', { name: /new demo round/i }))
  act(() => {
    vi.advanceTimersByTime(START_SIMULATION_MS)
  })
}

/**
 * The reveal is a chain of useEffect → setTimeout → state → effect…
 * Each act() flush can only advance ONE chained tick (the next timer is
 * scheduled during the effect flush), so we advance one tick at a time.
 */
function advanceRevealTicks(ticks: number) {
  for (let i = 0; i < ticks; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

describe('Console screen', () => {
  it('displays the logged-in operator ID in the header', () => {
    render(<Console operatorId="op-31337" onLogout={vi.fn()} />)
    expect(screen.getByTestId('operator-id')).toHaveTextContent('op-31337')
  })

  it('shows the simulated ONLINE USERS counter (decoration only)', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)
    const counter = screen.getByTestId('online-users')
    expect(counter).toBeInTheDocument()
    const value = Number(counter.textContent)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(20)
    expect(value).toBeLessThanOrEqual(600)
  })

  it('shows the persistent non-real-money disclaimer and publishing boundary', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)
    expect(screen.getByText(/no real money · no wagering/i)).toBeInTheDocument()
    expect(screen.getByText('Local generation')).toBeInTheDocument()
    expect(screen.getByText('Publishing')).toBeInTheDocument()
    expect(screen.getByText(/NEW GAME only \(guarded\)/i)).toBeInTheDocument()
  })

  it('SHOW is disabled before a round exists; LOAD LIVE ROUND is disabled offline', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)
    expect(screen.getByRole('button', { name: /show/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /new demo round/i })).toBeEnabled()
    // Offline: there is no live round to load and no Firebase to publish to.
    expect(screen.getByRole('button', { name: /load live round/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /new game/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /new demo round/i })).toBeEnabled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('NEW DEMO ROUND generates a validated 50-position round and then enables SHOW', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    startRound()

    // Ready state: 50 grid cells render with their position labels.
    expect(screen.getByText(/Round ready/i)).toBeInTheDocument()
    const cells = screen.getAllByRole('img')
    expect(cells).toHaveLength(50)
    expect(screen.getByRole('button', { name: /show/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /new demo round/i })).toBeEnabled()
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent('Local generation')
  })

  it('NEW DEMO ROUND keeps SHOW disabled while the round is being prepared', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /new demo round/i }))
    expect(screen.getByRole('button', { name: /show/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /preparing/i })).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(START_SIMULATION_MS)
    })
    expect(screen.getByRole('button', { name: /show/i })).toBeEnabled()
  })

  it('SHOW reveals the grid row by row and completes after 10 rows', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    startRound()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByRole('button', { name: /revealing/i })).toBeDisabled()

    // Row 1
    advanceRevealTicks(1)
    expect(screen.getByText(/Row 1 of 10 revealed/i)).toBeInTheDocument()

    // Rows 2–10
    advanceRevealTicks(GRID_ROWS - 1)
    expect(screen.getByText(/Row 10 of 10 revealed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /result shown/i })).toBeInTheDocument()
    expect(screen.getByText(/20 safe cells/i)).toBeInTheDocument() // curve total
  })

  it('reveals exactly one additional row per reveal tick', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    startRound()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))

    for (let row = 1; row <= GRID_ROWS; row += 1) {
      advanceRevealTicks(1)
      expect(screen.getByText(new RegExp(`Row ${row} of 10 revealed`, 'i'))).toBeInTheDocument()
    }
  })

  it('keeps the revealed round stable — safe-cell total never changes during reveal', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    startRound()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))

    advanceRevealTicks(3)
    const afterThreeRows = screen
      .getAllByRole('img')
      .map((cell) => cell.getAttribute('aria-label'))
      .join('|')
    const labelCount = (needle: string) =>
      afterThreeRows.split('|').filter((label) => label?.includes(needle)).length
    const safeAtThree = labelCount('safe')
    const bombAtThree = labelCount('bomb')

    advanceRevealTicks(GRID_ROWS)
    const finalLabels = screen
      .getAllByRole('img')
      .map((cell) => cell.getAttribute('aria-label'))
      .join('|')
    const safeFinal = finalLabels.split('|').filter((label) => label?.includes('safe')).length
    const bombFinal = finalLabels.split('|').filter((label) => label?.includes('bomb')).length

    // Already-revealed rows keep their values; the totals only grow.
    expect(safeFinal).toBeGreaterThanOrEqual(safeAtThree)
    expect(bombFinal).toBeGreaterThanOrEqual(bombAtThree)
    expect(safeFinal + bombFinal).toBe(50)
    expect(safeFinal).toBe(20)
  })

  it('a second NEW DEMO ROUND after a completed round builds a fresh round and resets SHOW', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    startRound()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    advanceRevealTicks(GRID_ROWS)
    expect(screen.getByRole('button', { name: /result shown/i })).toBeInTheDocument()

    startRound()
    expect(screen.getByText(/Round ready/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show/i })).toBeEnabled()
    // New round starts fully hidden again.
    expect(screen.queryByText(/revealed/i)).not.toBeInTheDocument()
  })

  it('SHOW reveals EXACTLY the generated demo round, cell by cell (seed read from the UI)', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /new demo round/i }))
    act(() => {
      vi.advanceTimersByTime(START_SIMULATION_MS)
    })

    // The console displays the round's seed — use it to rebuild the exact
    // expected round via the real generator (no mocks involved).
    const meta = screen.getByText(/seed \d+/).textContent ?? ''
    const seed = Number(meta.match(/seed (\d+)/)?.[1])
    expect(Number.isFinite(seed)).toBe(true)
    const expected = generateDemoRound(seed)
    const expectedNode = expected.node as unknown as Record<string, Record<string, '0' | '1'>>

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    advanceRevealTicks(GRID_ROWS)

    const revealed: Record<string, string> = {}
    for (const cell of screen.getAllByRole('img')) {
      const match = (cell.getAttribute('aria-label') ?? '').match(/^Position (m\d+) — (safe|bomb)$/)
      if (match) revealed[match[1]] = match[2]
    }
    expect(Object.keys(revealed)).toHaveLength(50)
    for (let n = 1; n <= 50; n += 1) {
      const key = `m${n}`
      const expectedCell = expectedNode[key][key]
      expect(revealed[key], `${key} must match the generated round`).toBe(
        expectedCell === '1' ? 'safe' : 'bomb',
      )
    }
    expect(screen.getByText(/20 safe cells/i)).toBeInTheDocument()
  })

  it('offline mode never publishes and keeps the local demo generator as fallback', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /new demo round/i }))
    act(() => {
      vi.advanceTimersByTime(START_SIMULATION_MS)
    })
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
      })
    }
    expect(publishMock).not.toHaveBeenCalled()
    expect(screen.getByText(/20 safe cells/i)).toBeInTheDocument()
  })

  it('logout button calls onLogout', () => {
    const onLogout = vi.fn()
    render(<Console operatorId="op-1" onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('renders all 10 multiplier rungs from the single typed config', () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)
    for (const multiplier of [
      '×1.23', '×1.54', '×1.93', '×2.41', '×4.02',
      '×6.71', '×11.18', '×27.97', '×69.93', '×349.68',
    ]) {
      expect(screen.getByText(multiplier)).toBeInTheDocument()
    }
  })
})

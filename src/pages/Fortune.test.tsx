import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fortune } from './Fortune'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS } from '../config/game'
import type { M11SyncEvaluation } from '../utils/m11Snapshot'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'
import type { M11Node } from '../types/game'
import { validateM11Node } from '../utils/validation'

/**
 * Public Web (Apple of Fortune) regression suite.
 *
 * The page must behave as a read-only mirror of the CURRENT /m11 state:
 *  - the board is built from the /m11 snapshot (m1…m50, exact order);
 *  - "1" renders SAFE/APPLE and "0" renders BROKEN/TRAP (APP 2 semantics);
 *  - a /m11 change updates the board (flipping m17 changes exactly m17);
 *  - the local generator is NEVER called to render the current round;
 *  - there is NO random fallback when /m11 is unreachable;
 *  - the only generator use is the explicit NEW ROUND creation/publish path.
 *
 * Only the Firebase SDK surface is mocked (captured listener + publish
 * spy); the real useM11Mirror hook and the real Fortune page run.
 */

/* Whether the shared round source is "configured" — toggled per test. */
const firebaseConfigured = vi.hoisted(() => ({ value: false }))
vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => firebaseConfigured.value,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => {
    throw new Error('Firebase is intentionally not reachable in Fortune tests')
  },
}))

const publishMock = vi.hoisted(() => vi.fn((_node: M11Node) => Promise.resolve()))
const listeners = vi.hoisted(() => ({
  current: null as
    | { onUpdate: (update: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
        onError?: (error: unknown) => void }
    | null,
}))
vi.mock('../services/m11', () => ({
  subscribeToM11Sync: (handlers: {
    onUpdate: (update: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
    onError?: (error: unknown) => void
  }) => {
    listeners.current = handlers
    return () => undefined
  },
  publishDemoRound: publishMock,
}))

/* The REAL generator, wrapped in a spy that counts every call. */
const generatorSpy = vi.hoisted(() => vi.fn())
vi.mock('../utils/generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/generator')>()
  return {
    ...actual,
    generateDemoRound: (seed?: number) => {
      generatorSpy(seed)
      return actual.generateDemoRound(seed)
    },
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  firebaseConfigured.value = false
  listeners.current = null
  publishMock.mockClear()
  generatorSpy.mockClear()
})

afterEach(() => {
  cleanup()
  publishMock.mockClear()
  generatorSpy.mockClear()
  vi.useRealTimers()
})

/** Raw /m11 wire payload whose stored "1" (safe) keys are exactly `safeKeys`. */
function rawFromSafeKeys(safeKeys: readonly string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of M_KEYS) {
    raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return raw
}

/** Delivers a /m11 snapshot to the page's read-only observer. */
function pushSnapshot(safeKeys: readonly string[], receivedAt: number) {
  act(() => {
    listeners.current?.onUpdate({
      evaluation: evaluateM11Snapshot(rawFromSafeKeys(safeKeys)),
      receivedAt,
    })
  })
}

/** Revealed board state per key: { mN: 'safe' | 'bomb' }, from aria labels. */
function revealedBoard(): Record<string, 'safe' | 'bomb'> {
  const board: Record<string, 'safe' | 'bomb'> = {}
  const cells = screen.getAllByRole('img')
  expect(cells).toHaveLength(50)
  for (const cell of cells) {
    const match = (cell.getAttribute('aria-label') ?? '').match(/^Position (m\d+) — (safe|bomb)$/)
    expect(match, `unexpected board cell label "${cell.getAttribute('aria-label')}"`).not.toBeNull()
    board[match![1]] = match![2] as 'safe' | 'bomb'
  }
  return board
}

/** The board must equal the /m11 payload cell for cell ("1"→safe, "0"→bomb). */
function expectBoardMatchesPayload(board: Record<string, 'safe' | 'bomb'>, safeKeys: readonly string[]) {
  expect(Object.keys(board)).toHaveLength(50)
  for (const key of M_KEYS) {
    expect(board[key], `${key}: board must mirror /m11`).toBe(safeKeys.includes(key) ? 'safe' : 'bomb')
  }
}

/** Reveal click + full row-by-row reveal animation. */
function revealAll() {
  fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
  for (let i = 0; i <= GRID_ROWS; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

/** NEW ROUND (create + publish) with the real generator and mocked write. */
async function clickNewRound() {
  fireEvent.click(screen.getByRole('button', { name: /new round/i }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('Apple of Fortune game console', () => {
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

  it('never invents a random prediction when the shared round is unreachable', () => {
    // No Firebase connection, no snapshot: the page must show an explicit
    // unavailable state — NOT a locally generated fallback round.
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getAllByText('The current round is unavailable.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /new round/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBeDisabled()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(generatorSpy).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('never exposes control-plane terminology to the end user', () => {
    firebaseConfigured.value = true
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    pushSnapshot([...M_KEYS], 1_000)
    revealAll()
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

describe('Public Web board — /m11 is the source of truth for the current round', () => {
  beforeEach(() => {
    firebaseConfigured.value = true
  })

  it('displays a recognizable /m11 payload EXACTLY, m1…m50, without calling the generator', () => {
    // Deliberately recognizable /m11 round: alternating m1="1", m2="0",
    // m3="1", m4="0", … (all odd keys safe). The board must mirror it
    // directly — never a generated pattern.
    const safeKeys = M_KEYS.filter((key) => Number(key.slice(1)) % 2 === 1)
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    pushSnapshot(safeKeys, 1_000)
    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBeEnabled()
    revealAll()

    const board = revealedBoard()
    expectBoardMatchesPayload(board, safeKeys)

    // "1" → SAFE/APPLE, "0" → BROKEN/TRAP, exactly as stored in /m11.
    expect(Object.values(board).filter((visual) => visual === 'safe')).toHaveLength(25)
    expect(Object.values(board).filter((visual) => visual === 'bomb')).toHaveLength(25)

    // Rendering the current /m11 round must not use the local generator,
    // and must never write to /m11.
    expect(generatorSpy).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('a held round is replaced by a NEWER /m11 snapshot before reveal', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    pushSnapshot(['m1'], 1_000)
    pushSnapshot(['m2', 'm50'], 2_000)
    revealAll()

    expectBoardMatchesPayload(revealedBoard(), ['m2', 'm50'])
    expect(generatorSpy).not.toHaveBeenCalled()
  })

  it('flipping ONE /m11 value (m17 "0" → "1") changes EXACTLY Web cell m17', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    // Round one: every child is "0" → every revealed cell is broken/trap.
    pushSnapshot([], 1_000)
    revealAll()
    const before = revealedBoard()
    expectBoardMatchesPayload(before, [])

    // /m11 changes: only m17 flips "0" → "1".
    pushSnapshot(['m17'], 2_000)

    const after = revealedBoard()
    expect(after.m17).toBe('safe') // "1" → SAFE / APPLE
    for (const key of M_KEYS) {
      if (key !== 'm17') {
        expect(after[key], `${key} must remain unchanged`).toBe(before[key])
      }
    }
    // Exactly one board cell changed — proof of a live /m11 mirror, not a
    // freshly generated prediction.
    const changed = M_KEYS.filter((key) => before[key] !== after[key])
    expect(changed).toEqual(['m17'])
    expect(generatorSpy).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })
})

describe('NEW ROUND — create + publish to /m11 (the only generator use)', () => {
  beforeEach(() => {
    firebaseConfigured.value = true
  })

  it('generates once, publishes once, and the board shows exactly the published values', async () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    await clickNewRound()

    // A) exactly ONE generation and ONE guarded publish to /m11.
    expect(generatorSpy).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(1)
    const payload = publishMock.mock.calls[0][0] as M11Node
    expect(validateM11Node(payload)).toEqual({ valid: true })
    expect(Object.keys(payload)).toHaveLength(50)

    // The board must equal the published payload (what /m11 now contains).
    const safeKeys = M_KEYS.filter((key) => (payload[key] as unknown as Record<string, '0' | '1'>)[key] === '1')
    revealAll()
    expectBoardMatchesPayload(revealedBoard(), safeKeys)
  })

  it('a second NEW ROUND publishes a fresh single result and the board follows it exactly', async () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    await clickNewRound()
    const first = publishMock.mock.calls[0][0] as M11Node
    revealAll()

    // Real-world pacing between two starts (fake timers otherwise freeze the
    // clock, and the demo generator seeds itself from Date.now()).
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    await clickNewRound()
    expect(generatorSpy).toHaveBeenCalledTimes(2) // exactly one per start
    expect(publishMock).toHaveBeenCalledTimes(2)
    const second = publishMock.mock.calls[1][0] as M11Node
    expect(second).not.toEqual(first)

    revealAll()
    const safeKeys = M_KEYS.filter((key) => (second[key] as unknown as Record<string, '0' | '1'>)[key] === '1')
    expectBoardMatchesPayload(revealedBoard(), safeKeys)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fortune } from './Fortune'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS } from '../config/game'
import type { M11Node, M11Value } from '../types/game'
import type { M11SyncEvaluation } from '../utils/m11Snapshot'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'
import { validateM11Node } from '../utils/validation'

/**
 * PUBLIC WEB ⇄ Firebase /m11 synchronization regression tests.
 *
 * Firebase is "configured" and the /m11 listener delivers snapshots. The local
 * generator is mocked so every test can prove whether display paths call it:
 * rendering the CURRENT Firebase round must NEVER call it — only the explicit
 * NEW ROUND creation (generate → validate → publish) may.
 */

const generateMock = vi.hoisted(() =>
  vi.fn<() => { seed: number; createdAt: number; node: M11Node; rows: unknown[] }>(() => {
    throw new Error('generator must NOT be called by Firebase-display paths')
  }),
)
const publishMock = vi.hoisted(() => vi.fn((_node: M11Node) => Promise.resolve()))

vi.mock('../utils/generator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/generator')>()),
  generateDemoRound: generateMock,
}))

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => true,
  subscribeToConnectionState: () => () => undefined,
}))

const listeners = vi.hoisted(() => ({
  current: null as
    | { onUpdate: (u: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
        onError?: (error: unknown) => void }
    | null,
}))

const subscribeMock = vi.hoisted(() => vi.fn())

vi.mock('../services/m11', () => ({
  subscribeToM11Sync: (handlers: {
    onUpdate: (update: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
    onError?: (error: unknown) => void
  }) => {
    subscribeMock()
    listeners.current = handlers
    return () => undefined
  },
  publishDemoRound: publishMock,
}))

/** Builds a raw /m11 snapshot whose SAFE ("1") keys are exactly `safeKeys`. */
function snapshotWithSafe(safeKeys: string[], receivedAt: number) {
  const raw: Record<string, unknown> = {}
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return { evaluation: evaluateM11Snapshot(raw), receivedAt }
}

/** A deterministic generator-shaped round built without the real generator. */
function generatorRoundMock(safeKeys: string[], seed: number) {
  const node = {} as Record<string, Record<string, '0' | '1'>>
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    node[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return {
    seed,
    createdAt: seed * 1000,
    node: node as unknown as M11Node,
    rows: [],
  }
}

/** Safe keys of a published/generator node (where node[k][k] === '1'). */
function safeKeysOf(node: M11Node): string[] {
  const record = node as unknown as Record<string, Record<string, '0' | '1'>>
  return M_KEYS.filter((key) => record[key][key] === '1')
}

/** Currently revealed cells as a map key → 'safe' | 'bomb'. */
function revealedCellMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cell of screen.getAllByRole('img')) {
    const label = cell.getAttribute('aria-label') ?? ''
    const match = label.match(/^Position (m\d+) — (safe|bomb)$/)
    if (match) map[match[1]] = match[2]
  }
  return map
}

function expectCellsMatch(map: Record<string, string>, safeKeys: string[]) {
  expect(Object.keys(map)).toHaveLength(50)
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    expect(map[key], `${key} must match the Firebase round`).toBe(safeKeys.includes(key) ? 'safe' : 'bomb')
  }
}

/** Delivers one /m11 snapshot through the captured listener. */
function deliver(safeKeys: string[], receivedAt: number): void {
  act(() => {
    listeners.current?.onUpdate(snapshotWithSafe(safeKeys, receivedAt))
  })
}

function revealAll() {
  fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
  for (let i = 0; i <= GRID_ROWS; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

async function clickNewRound() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
  })
}

function renderFortune() {
  render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners.current = null
  generateMock.mockReset()
  publishMock.mockReset()
  subscribeMock.mockClear()
  // Default generator behaviour: a fresh deterministic round per call.
  let seed = 0
  generateMock.mockImplementation(() => {
    seed += 1
    return generatorRoundMock([`m${seed}`], seed)
  })
  publishMock.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Public Web — Firebase /m11 is the displayed source of truth', () => {
  it('MOST IMPORTANT: a known 50-value Firebase sequence renders EXACTLY, in order, with no generation', () => {
    // Deliberately asymmetric and recognizable: no rotation, reversal, or
    // shift of the payload could produce this board by accident.
    const SAFE = ['m1', 'm3', 'm4', 'm9', 'm12', 'm17', 'm21', 'm22', 'm28', 'm31', 'm33', 'm36', 'm37', 'm38', 'm44', 'm46', 'm49', 'm50']
    renderFortune()
    expect(subscribeMock).toHaveBeenCalledTimes(1) // the /m11 listener is attached
    deliver(SAFE, 1_700_000_000_000)

    // The current Firebase round is held automatically — nothing generated,
    // nothing published merely to display it.
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBeEnabled()

    revealAll()

    // Compared DIRECTLY against the Firebase payload: "1" → safe apple,
    // "0" → broken trap, m1…m50 → cells 1…50.
    expectCellsMatch(revealedCellMap(), SAFE)

    // Exact board order: rows stack m46…m50 first down to m1…m5 last, and the
    // five cells inside every row keep Firebase key order (no shuffle,
    // no re-indexing, no reversing).
    const domOrder = screen.getAllByRole('img').map((cell) => {
      const match = (cell.getAttribute('aria-label') ?? '').match(/^Position (m\d+) —/)
      return match![1]
    })
    const expectedOrder: string[] = []
    for (let row = 10; row >= 1; row -= 1) {
      for (let col = 1; col <= 5; col += 1) expectedOrder.push(`m${(row - 1) * 5 + col}`)
    }
    expect(domOrder).toEqual(expectedOrder)
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('SECOND: flipping one Firebase value (m17) changes ONLY Web cell 17', () => {
    const BEFORE = ['m1', 'm7', 'm25', 'm50']
    renderFortune()
    deliver(BEFORE, 1_000)
    expect(generateMock).not.toHaveBeenCalled()

    // Firebase changes while the round is held: the board follows without
    // any generator call.
    deliver([...BEFORE, 'm17'], 2_000)
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()

    revealAll()

    const map = revealedCellMap()
    expectCellsMatch(map, [...BEFORE, 'm17'])
    expect(map.m17).toBe('safe')
    // Every other cell still matches the original Firebase snapshot.
    for (const key of M_KEYS) {
      if (key === 'm17') continue
      expect(map[key]).toBe(BEFORE.includes(key) ? 'safe' : 'bomb')
    }
  })

  it('replaces a held (not yet revealed) round wholesale when Firebase changes', () => {
    renderFortune()
    deliver(['m1'], 1_000)
    deliver(['m2', 'm50'], 2_000)

    revealAll()

    expectCellsMatch(revealedCellMap(), ['m2', 'm50'])
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('stored "1" renders SAFE/APPLE for every cell of an all-safe Firebase round', () => {
    renderFortune()
    deliver([...M_KEYS], 1_000)
    revealAll()

    const cells = screen.getAllByRole('img')
    expect(cells).toHaveLength(50)
    for (const cell of cells) {
      expect(cell.getAttribute('aria-label')).toMatch(/— safe$/)
    }
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('stored "0" renders BROKEN/TRAP for every cell of an all-broken Firebase round', () => {
    renderFortune()
    deliver([], 1_000)
    revealAll()

    const cells = screen.getAllByRole('img')
    expect(cells).toHaveLength(50)
    for (const cell of cells) {
      expect(cell.getAttribute('aria-label')).toMatch(/— bomb$/)
    }
    expect(generateMock).not.toHaveBeenCalled()
  })
})

describe('Public Web — no invented predictions when Firebase is unavailable', () => {
  it('waits before the first snapshot: no cells, no generation, no publish', () => {
    renderFortune()
    expect(listeners.current).not.toBeNull()
    expect(screen.getAllByText('Waiting for the current round…').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDisabled()
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('an empty /m11 shows the waiting state and recovers when a round arrives', () => {
    renderFortune()
    act(() => {
      listeners.current?.onUpdate({ evaluation: evaluateM11Snapshot(null), receivedAt: 1_000 })
    })

    expect(screen.getAllByText('Waiting for the current round…').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(generateMock).not.toHaveBeenCalled()

    deliver(['m5'], 2_000)
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m5'])
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('an invalid /m11 is never displayed and never replaces a held round', () => {
    renderFortune()
    const invalid: Record<string, unknown> = {}
    for (let n = 1; n <= 50; n += 1) invalid[`m${n}`] = { [`m${n}`]: n === 5 ? 1 : '0' }
    act(() => {
      listeners.current?.onUpdate({ evaluation: evaluateM11Snapshot(invalid), receivedAt: 1_000 })
    })

    expect(screen.getAllByText('Waiting for the current round…').length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(generateMock).not.toHaveBeenCalled()

    // A valid round arrives and is held…
    deliver(['m9'], 2_000)
    // …then Firebase turns invalid again: the held valid round is kept
    // (never replaced with a partial snapshot, never regenerated).
    act(() => {
      listeners.current?.onUpdate({ evaluation: evaluateM11Snapshot(invalid), receivedAt: 3_000 })
    })
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m9'])
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })
})

describe('Public Web — NEW ROUND creation still publishes through the single guarded path', () => {
  it('generates ONCE, publishes ONCE, and the board matches the published payload exactly', async () => {
    renderFortune()
    deliver(['m2', 'm3'], 1_000)

    await clickNewRound()

    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(1)
    const published = publishMock.mock.calls[0][0] as M11Node
    expect(validateM11Node(published)).toEqual({ valid: true })

    // The Firebase echo of the just-published round keeps the board identical.
    const values = safeKeysOf(published)
    deliver(values, 9_999_999_999_999)
    expect(generateMock).toHaveBeenCalledTimes(1)

    revealAll()
    expectCellsMatch(revealedCellMap(), values)
  })

  it('a newer Firebase round after reveal is ADOPTED — no generation, no publish', async () => {
    renderFortune()
    deliver(['m1'], 1_000)
    revealAll()
    expect(generateMock).not.toHaveBeenCalled()

    // Firebase advances while the finished round is on screen.
    const FRESH = ['m17', 'm42']
    deliver(FRESH, 2_000)
    expect(screen.getByRole('button', { name: /new round/i })).toHaveTextContent('Fresh round')

    // Taking the fresh round displays Firebase truth — it must not invent a
    // replacement prediction nor overwrite the Firebase state.
    await clickNewRound()
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBeEnabled()

    revealAll()
    expectCellsMatch(revealedCellMap(), FRESH)
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('mounting, Firebase updates, and revealing never publish (APP 2 contract untouched)', async () => {
    renderFortune()
    deliver(['m1'], 1_000)
    deliver(['m1', 'm2'], 2_000)
    revealAll()
    expect(publishMock).not.toHaveBeenCalled()

    // Creation from an empty bridge still works and stays contract-exact.
    cleanup()
    renderFortune()
    act(() => {
      listeners.current?.onUpdate({ evaluation: evaluateM11Snapshot(null), receivedAt: 1 })
    })
    await clickNewRound()
    expect(publishMock).toHaveBeenCalledTimes(1)
    const published = publishMock.mock.calls[0][0] as M11Node
    expect(Object.keys(published)).toEqual([...M_KEYS])
    for (const key of M_KEYS) {
      const child = published[key] as unknown as Record<string, M11Value>
      expect(published[key]).toEqual({ [key]: expect.any(String) })
      expect(child[key] === '0' || child[key] === '1').toBe(true)
    }
    expect(validateM11Node(published)).toEqual({ valid: true })
  })
})

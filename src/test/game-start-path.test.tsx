import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Console } from '../pages/Console'
import { Fortune } from '../pages/Fortune'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS, ROWS, SAFE_CELL_CURVE } from '../config/game'
import type { M11Node, M11Value } from '../types/game'

/**
 * REAL Firebase execution-path tests.
 *
 * Only the Firebase SDK layer (`firebase/database`) is mocked, purely to
 * CAPTURE what the app reads from /m11 and what the app writes. Everything
 * else is production code:
 *
 *   PUBLIC WEB DISPLAY
 *     → subscribeToM11Sync() → onValue(ref(db, 'm11'))
 *     → evaluateM11Snapshot(raw) → liveValuesToRows → rendered board
 *
 *   ADMIN NEW GAME (publish workflow — preserved separately)
 *     → handleNewGame
 *     → generateDemoRound()                  (real generator)
 *     → validateM11Node()                    (real contract validator)
 *     → publishDemoRound() → ref(db,'m11') + update()   (real single write path)
 *     → board state (nodeToRows) → rendered board
 *
 * These tests prove:
 *   - the public web is a read-only mirror of the existing Firebase /m11 data;
 *   - it never calls a local prediction generator simply to display the round;
 *   - the admin NEW GAME path still generates once, writes /m11 once, and
 *     renders exactly the published values.
 */

const updateMock = vi.hoisted(() => vi.fn((_ref: unknown, _node: unknown) => Promise.resolve()))
const refMock = vi.hoisted(() => vi.fn((_db: unknown, path: unknown) => ({ path: `${path}` })))
const onValueMock = vi.hoisted(() => vi.fn())
const liveValue = vi.hoisted(() => ({ current: null as null | ((snapshot: { val: () => unknown }) => void) }))
const fakeDb = vi.hoisted(() => ({ fakeDemoDatabase: true }))

vi.mock('firebase/database', () => ({ ref: refMock, update: updateMock, onValue: onValueMock }))

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => true,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => fakeDb,
}))

/* The REAL generator implementation, with a spy that counts generations.
 * If any second/duplicate generation path existed, these counts break. */
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
  liveValue.current = null
  onValueMock.mockImplementation((_ref: unknown, onData: (snapshot: { val: () => unknown }) => void) => {
    liveValue.current = onData
    return () => undefined
  })
})

afterEach(() => {
  cleanup()
  updateMock.mockClear()
  refMock.mockClear()
  onValueMock.mockClear()
  generatorSpy.mockClear()
  liveValue.current = null
  vi.useRealTimers()
})

/** The node written to Firebase by publish call `call` (0-based). */
function publishedPayload(call: number): M11Node {
  expect(updateMock).toBeCalledTimes(call + 1)
  const [nodeRef, node] = updateMock.mock.calls[call]
  expect((nodeRef as { path: string }).path).toBe('m11') // fixed path — never anything else
  return node as M11Node
}

/** Flattened { mN: "0" | "1" } of a payload. */
function payloadValues(node: M11Node): Record<string, M11Value> {
  const values: Record<string, M11Value> = {}
  for (const key of M_KEYS) {
    const child = node[key] as unknown as Record<string, M11Value>
    values[key] = child[key]
  }
  return values
}

/** Board state per key: { mN: 'safe' | 'bomb' } — from the rendered board. */
function revealedBoard(): Record<string, string> {
  const board: Record<string, string> = {}
  const cells = screen.getAllByRole('img')
  expect(cells).toHaveLength(50)
  for (const cell of cells) {
    const label = cell.getAttribute('aria-label') ?? ''
    const match = label.match(/^Position (m\d+) — (safe|bomb)$/)
    expect(match, `unexpected board cell label "${label}"`).not.toBeNull()
    board[match![1]] = match![2]
  }
  return board
}

/** Contract shape of a published node, m1…m50 exactly, strings only. */
function expectContractShape(node: M11Node): void {
  expect(Object.keys(node)).toEqual([...M_KEYS])
  for (const key of M_KEYS) {
    expect(node[key]).toEqual({ [key]: expect.any(String) })
    const value = (node[key] as unknown as Record<string, M11Value>)[key]
    expect(value === '0' || value === '1').toBe(true)
  }
}

/** Payload follows src/config/game.ts: per-row stored-"1" counts = SAFE_CELL_CURVE. */
function expectPayloadFollowsConfig(node: M11Node): void {
  ROWS.forEach((spec, index) => {
    const ones = spec.keys.filter((key) => (node[key] as unknown as Record<string, M11Value>)[key] === '1').length
    expect(ones, `${spec.multiplier} row must store ${SAFE_CELL_CURVE[index]} "1" cells`).toBe(SAFE_CELL_CURVE[index])
  })
}

function advanceReveal() {
  for (let tick = 0; tick <= GRID_ROWS; tick += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

/** Raw /m11 fixture: the exact Firebase wire shape { mN: { mN: "0"|"1" } }. */
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

function emitLiveSnapshot(safeKeys: readonly string[]) {
  act(() => {
    liveValue.current?.({ val: () => rawSnapshot(safeKeys) })
  })
}

describe('PUBLIC WEB DISPLAY — real Firebase /m11 read path', () => {
  it('subscribes to /m11 and renders every existing cell value 1:1 without generating or writing', async () => {
    const safe = deterministicSafeKeys()
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    expect(onValueMock).toHaveBeenCalledTimes(1)
    emitLiveSnapshot(safe)

    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    advanceReveal()

    const board = revealedBoard()
    const values: Record<string, M11Value> = {}
    for (const key of M_KEYS) values[key] = safe.includes(key) ? '1' : '0'
    for (const key of M_KEYS) {
      // Public board contract: stored "1" = SAFE/APPLE, stored "0" = BROKEN/TRAP.
      expect(board[key], `${key}: board must equal Firebase /m11 ${key}`).toBe(values[key] === '1' ? 'safe' : 'bomb')
    }

    expect(generatorSpy).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('updates cell 17 when Firebase m17 changes from "0" to "1" without local generation', async () => {
    const initial = deterministicSafeKeys() // m17 is "0"
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    emitLiveSnapshot(initial)
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    advanceReveal()
    expect(screen.getByLabelText('Position m17 — bomb')).toBeInTheDocument()

    emitLiveSnapshot([...initial, 'm17'])

    expect(screen.getByLabelText('Position m17 — safe')).toBeInTheDocument()
    expect(screen.queryByLabelText('Position m17 — bomb')).toBeNull()
    expect(generatorSpy).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('ADMIN NEW GAME — real execution path (Console "New Game")', () => {
  it('uses the same single generation + single /m11 write and shows the same values', async () => {
    render(<Console operatorId="op-1" onLogout={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /new game/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(generatorSpy).toBeCalledTimes(1)
    expect(updateMock).toBeCalledTimes(1)

    const payload = publishedPayload(0)
    expectContractShape(payload)
    expectPayloadFollowsConfig(payload)

    fireEvent.click(screen.getByRole('button', { name: /^show$/i }))
    advanceReveal()

    // Admin grid vocabulary keeps the backend meaning ("1" → safe); the board
    // still has to equal the published payload element for element.
    const values = payloadValues(payload)
    const board = revealedBoard()
    for (const key of M_KEYS) {
      expect(board[key], `${key}: admin board must equal /m11`).toBe(values[key] === '1' ? 'safe' : 'bomb')
    }
  })
})

describe('single source of truth', () => {
  it('SAFE_CELL_CURVE is derived from ROWS in src/config/game.ts (no second pattern table)', () => {
    expect(SAFE_CELL_CURVE).toEqual(ROWS.map((row) => row.safeCells))
    expect(SAFE_CELL_CURVE).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 4])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Console } from '../pages/Console'
import { Fortune } from '../pages/Fortune'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS, ROWS, SAFE_CELL_CURVE } from '../config/game'
import type { M11Node, M11Value } from '../types/game'

/**
 * REAL game-start execution-path tests.
 *
 * Only the Firebase SDK layer (`firebase/database`) is mocked, purely to
 * CAPTURE what the app writes. Everything else is production code:
 *
 *   START button (Fortune "New round" / admin "New Game")
 *     → handleNewRound / handleNewGame            (real page handlers)
 *     → generateDemoRound()                        (real generator)
 *     → validateM11Node()                          (real contract validator)
 *     → publishDemoRound() → ref(db,'m11') + update()   (real single write path)
 *     → board state (nodeToRows) → rendered board  (real board components)
 *
 * These tests prove: ONE generation per start, ONE Firebase write per start,
 * the write goes to /m11 only, the payload follows src/config/game.ts, and
 * the PUBLIC BOARD renders exactly the published values (m1…m50, in order).
 */

const updateMock = vi.hoisted(() => vi.fn((_ref: unknown, _node: unknown) => Promise.resolve()))
const refMock = vi.hoisted(() => vi.fn((_db: unknown, path: unknown) => ({ path: `${path}` })))
const onValueMock = vi.hoisted(() => vi.fn(() => () => undefined))
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
})

afterEach(() => {
  cleanup()
  updateMock.mockClear()
  refMock.mockClear()
  onValueMock.mockClear()
  generatorSpy.mockClear()
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

/** Row → [safe visuals, broken visuals] on the PUBLIC board (m1..m50 order). */
function publicRowGroups(board: Record<string, string>): Map<number, [number, number]> {
  return new Map(
    ROWS.map((spec) => {
      const safe = spec.keys.filter((key) => board[key] === 'safe').length
      const broken = spec.keys.filter((key) => board[key] === 'bomb').length
      return [spec.row, [safe, broken]] as const
    }),
  )
}

const REQUIRED_GROUPS: Readonly<Record<number, readonly [number, number]>> = {
  1: [4, 1], 2: [4, 1], 3: [4, 1], 4: [4, 1], // ×1.23 → ×2.41 : 4 safe + 1 broken
  5: [3, 2], 6: [3, 2], 7: [3, 2],            // ×4.02 → ×11.18: 3 safe + 2 broken
  8: [2, 3],                                   // ×27.97        : 2 safe + 3 broken
  9: [2, 3],                                   // ×69.93        : 2 safe + 3 broken
  10: [1, 4],                                  // ×349.68       : 1 safe + 4 broken
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

describe('PUBLIC WEB START — real execution path (Fortune "New round")', () => {
  it('generates ONE round, writes /m11 ONCE, and the board shows exactly the published values', async () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    // The read-only /m11 observer attaches exactly once and writes nothing.
    expect(onValueMock).toBeCalledTimes(1)
    expect(updateMock).not.toHaveBeenCalled()

    // START.
    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // ONE generation, ONE Firebase write — no duplicate path, no second result.
    expect(generatorSpy).toBeCalledTimes(1)
    expect(updateMock).toBeCalledTimes(1)
    expect(refMock.mock.results.map((result) => result.value.path)).toContain('m11')

    const payload = publishedPayload(0)
    expectContractShape(payload)
    expectPayloadFollowsConfig(payload)

    // Reveal and compare the PUBLIC BOARD with the FIREBASE payload, m1…m50.
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    advanceReveal()

    const board = revealedBoard()
    const values = payloadValues(payload)
    for (const key of M_KEYS) {
      // Fixed public visual mapping: stored "1" → trap/broken, stored "0" → safe.
      expect(board[key], `${key}: board (${board[key]}) must equal /m11 (${values[key]})`).toBe(values[key] === '1' ? 'bomb' : 'safe')
    }

    // The five required pattern groups, on the real rendered board.
    for (const [row, expected] of Object.entries(REQUIRED_GROUPS)) {
      expect(publicRowGroups(board).get(Number(row))).toEqual(expected)
    }
  })

  it('a SECOND start publishes a fresh single result and the board follows it exactly', async () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    advanceReveal()

    // START again from the finished state.
    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(generatorSpy).toBeCalledTimes(2) // exactly one generation per start
    expect(updateMock).toBeCalledTimes(2)   // exactly one /m11 write per start

    const second = payloadValues(publishedPayload(1))
    expectPayloadFollowsConfig(publishedPayload(1))

    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))
    advanceReveal()

    const board = revealedBoard()
    for (const key of M_KEYS) {
      expect(board[key]).toBe(second[key] === '1' ? 'bomb' : 'safe')
    }
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

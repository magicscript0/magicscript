import { describe, expect, it } from 'vitest'
import { CELL_COUNT, GRID_COLS, M_KEYS, ROWS, SAFE_CELL_CURVE } from '../config/game'
import { createRng, generateDemoRound, nodeToRows } from './generator'
import { evaluateM11Snapshot, liveValuesToRows } from './m11Snapshot'
import { rowSafeCounts, validateM11Node } from './validation'
import type { M11Node } from '../types/game'

const EXPECTED_CURVE = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4]

describe('generateDemoRound', () => {
  it('produces exactly 50 positions with every key m1…m50 present exactly once', () => {
    const round = generateDemoRound(42)
    const keys = Object.keys(round.node).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    expect(keys).toEqual([...M_KEYS])
    expect(keys).toHaveLength(CELL_COUNT)
  })

  it('stores every child in the exact contract shape { mN: { mN: "0" | "1" } }', () => {
    const round = generateDemoRound(7)
    for (const key of M_KEYS) {
      const child = round.node[key] as unknown as Record<string, unknown>
      expect(child).toEqual({ [key]: expect.any(String) })
      expect(['0', '1']).toContain(child[key])
    }
  })

  it('only ever uses the string values "0" and "1" (never numbers or booleans)', () => {
    for (const seed of [1, 2, 3, 999, 123456]) {
      const round = generateDemoRound(seed)
      for (const key of M_KEYS) {
        const value = (round.node[key] as unknown as Record<string, unknown>)[key]
        expect(value === '0' || value === '1').toBe(true)
      }
    }
  })

  it('distributes safe cells per row exactly along the curve 1,1,1,1,2,2,2,3,3,4', () => {
    expect(SAFE_CELL_CURVE).toEqual(EXPECTED_CURVE)
    // Across many seeds the per-row safe count must be constant — the curve
    // is structural, not probabilistic.
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 77, 512, 65535]) {
      const counts = rowSafeCounts(generateDemoRound(seed).node)
      expect(counts).toEqual(EXPECTED_CURVE)
    }
  })

  it('maps keys to rows so that row N owns m(5N-4)…m(5N)', () => {
    const rows = nodeToRows(generateDemoRound(11).node)
    expect(rows).toHaveLength(10)
    rows.forEach((row) => {
      const first = 5 * row.row - 4
      expect(row.cells.map((cell) => cell.key)).toEqual(
        Array.from({ length: GRID_COLS }, (_, i) => `m${first + i}`),
      )
      expect(row.cells).toHaveLength(5)
    })
  })

  it('returns a round that passes full contract validation (no missing positions)', () => {
    const round = generateDemoRound(Date.now())
    expect(validateM11Node(round.node)).toEqual({ valid: true })
  })

  it('is deterministic: the same seed always reproduces the identical round', () => {
    const a = generateDemoRound(31337)
    const b = generateDemoRound(31337)
    expect(a.node).toEqual(b.node)
    expect(a.rows).toEqual(b.rows)
  })

  it('varies across different seeds', () => {
    const a = JSON.stringify(generateDemoRound(1).node)
    const b = JSON.stringify(generateDemoRound(2).node)
    expect(a).not.toEqual(b)
  })

  it('exports a PRNG that stays in [0, 1) and is seed-stable', () => {
    const rngA = createRng(99)
    const rngB = createRng(99)
    for (let i = 0; i < 1000; i += 1) {
      const value = rngA()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(value).toBe(rngB())
    }
  })

  it('places safe cells uniformly: over 200 seeds every column index hosts a safe cell', () => {
    const columnsWithSafe = new Set<number>()
    for (let seed = 0; seed < 200; seed += 1) {
      const round = generateDemoRound(seed)
      ROWS.forEach((spec) => {
        spec.keys.forEach((key, index) => {
          const child = round.node[key] as unknown as Record<string, string>
          if (child[key] === '1') columnsWithSafe.add(index)
        })
      })
    }
    expect([...columnsWithSafe].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('rowSafeCounts', () => {
  it('returns ten counts summing to the curve total (20 safe cells)', () => {
    const node: M11Node = generateDemoRound(5).node
    const counts = rowSafeCounts(node)
    expect(counts).toHaveLength(10)
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(20)
  })
})

describe('demo generator ↔ live snapshot structural parity', () => {
  it('produces rounds indistinguishable from a live /m11 snapshot: same validator, same m1…m50 row mapping', () => {
    for (const seed of [1, 42, 999, 123456]) {
      const round = generateDemoRound(seed)
      // Wire format identical to what onValue delivers for /m11:
      const raw = Object.fromEntries(M_KEYS.map((key) => [key, round.node[key]]))

      const evaluation = evaluateM11Snapshot(raw)
      expect(evaluation.status).toBe('valid')
      expect(evaluation.present).toHaveLength(50)
      expect(evaluation.safeCount).toBe(20)

      // The live mapper must reproduce the generator's own row view EXACTLY
      // (same ROWS config, same ordering, same "1"/"0" semantics).
      expect(liveValuesToRows(evaluation.values)).toEqual(nodeToRows(round.node))
    }
  })
})

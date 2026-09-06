import { describe, expect, it } from 'vitest'
import { M_KEYS, ROWS, formatMultiplier } from './config/game'
import { generateDemoRound } from './utils/generator'
import { boardVisualForValue } from './components/FortuneBoard'
import { validateM11Node } from './utils/validation'

/**
 * REQUIRED VERIFICATION — the five pattern groups on the PUBLIC prediction
 * board, using the fixed visual mapping from the audited Firebase contract
 * (stored "1" → safe apple, stored "0" → broken trap — APP 2 parity) and the
 * real generator, across many seeds. The generator curve itself is untouched:
 * rows 1–10 store exactly 1,1,1,1,2,2,2,3,3,4 "1" cells.
 */
const EXPECTED_VISUALS: Record<number, { multiplier: string; safe: number; broken: number }> = {
  1: { multiplier: '×1.23', safe: 1, broken: 4 },
  2: { multiplier: '×1.54', safe: 1, broken: 4 },
  3: { multiplier: '×1.93', safe: 1, broken: 4 },
  4: { multiplier: '×2.41', safe: 1, broken: 4 },
  5: { multiplier: '×4.02', safe: 2, broken: 3 },
  6: { multiplier: '×6.71', safe: 2, broken: 3 },
  7: { multiplier: '×11.18', safe: 2, broken: 3 },
  8: { multiplier: '×27.97', safe: 3, broken: 2 },
  9: { multiplier: '×69.93', safe: 3, broken: 2 },
  10: { multiplier: '×349.68', safe: 4, broken: 1 },
}

describe('required five-group visual pattern verification', () => {
  it('every row of every generated round shows the exact required visuals', () => {
    for (const seed of [0, 1, 2, 3, 7, 42, 99, 512, 65535, 123456, 999999]) {
      const round = generateDemoRound(seed)
      expect(validateM11Node(round.node)).toEqual({ valid: true })
      for (const row of round.rows) {
        const expected = EXPECTED_VISUALS[row.row]
        const safe = row.cells.filter((cell) => boardVisualForValue(cell.value) === 'safe').length
        const broken = row.cells.filter((cell) => boardVisualForValue(cell.value) === 'bomb').length
        expect(formatMultiplier(row.multiplier), `seed ${seed} row ${row.row} multiplier`).toBe(expected.multiplier)
        expect({ safe, broken }, `seed ${seed} row ${row.row} (${expected.multiplier})`).toEqual({ safe: expected.safe, broken: expected.broken })
      }
    }
  })

  it('the five groups, exactly as specified', () => {
    const round = generateDemoRound(2026)
    const group = (rows: number[]) => {
      const cells = round.rows.filter((row) => rows.includes(row.row)).flatMap((row) => row.cells)
      return {
        safe: cells.filter((cell) => boardVisualForValue(cell.value) === 'safe').length,
        broken: cells.filter((cell) => boardVisualForValue(cell.value) === 'bomb').length,
      }
    }
    expect(group([1, 2, 3, 4]), '×1.23 → ×2.41').toEqual({ safe: 4, broken: 16 }) // 4 rows × (1 safe + 4 broken)
    expect(group([5, 6, 7]), '×4.02 → ×11.18').toEqual({ safe: 6, broken: 9 }) // 3 rows × (2 safe + 3 broken)
    expect(group([8]), '×27.97').toEqual({ safe: 3, broken: 2 })
    expect(group([9]), '×69.93').toEqual({ safe: 3, broken: 2 })
    expect(group([10]), '×349.68').toEqual({ safe: 4, broken: 1 })
  })

  it('/m11 contract shape is untouched: m1…m50, { mN: "0" | "1" }', () => {
    for (const seed of [1, 42, 777]) {
      const node = generateDemoRound(seed).node
      expect(Object.keys(node)).toEqual([...M_KEYS])
      for (const key of M_KEYS) expect(node[key]).toEqual({ [key]: expect.anything() })
      expect(ROWS).toHaveLength(10)
      expect(ROWS.map((row) => row.keys).flat()).toEqual([...M_KEYS])
    }
  })
})

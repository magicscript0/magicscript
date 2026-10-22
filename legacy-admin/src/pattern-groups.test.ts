import { describe, expect, it } from 'vitest'
import { GRID_COLS, M_KEYS, ROWS, SAFE_CELL_CURVE, formatMultiplier } from './config/game'
import { generateDemoRound } from './utils/generator'
import { boardVisualForValue } from './components/FortuneBoard'
import { validateM11Node } from './utils/validation'

/**
 * Visual-mapping verification for the public prediction board.
 *
 * The /m11 contract semantics are authoritative and must never be inverted by
 * the visual layer:
 *
 *   stored "1" → SAFE/APPLE visual
 *   stored "0" → BROKEN/TRAP visual
 *
 * For generated (operator/publish-side) rounds, the per-row visual counts are
 * derived from the existing curve in src/config/game.ts — this file does not
 * invent or redesign a pattern.
 */
describe('visual mapping follows the /m11 value contract', () => {
  it('stored "1" is SAFE/APPLE and stored "0" is BROKEN/TRAP for every generated round', () => {
    expect(boardVisualForValue('1')).toBe('safe')
    expect(boardVisualForValue('0')).toBe('bomb')

    for (const seed of [0, 1, 2, 3, 7, 42, 99, 512, 65535, 123456, 999999]) {
      const round = generateDemoRound(seed)
      expect(validateM11Node(round.node)).toEqual({ valid: true })
      for (const row of round.rows) {
        const spec = ROWS.find((candidate) => candidate.row === row.row)
        expect(spec).toBeDefined()
        expect(formatMultiplier(row.multiplier), `seed ${seed} row ${row.row}`).toBe(formatMultiplier(spec!.multiplier))

        const storedSafe = row.cells.filter((cell) => cell.value === '1').length
        const visualSafe = row.cells.filter(
          (cell) => cell.value === '1' && boardVisualForValue(cell.value) === 'safe',
        ).length
        const visualBroken = GRID_COLS - visualSafe

        expect(storedSafe, `seed ${seed} row ${row.row} stored "1" count`).toBe(spec!.safeCells)
        expect(visualSafe, `seed ${seed} row ${row.row} safe visuals`).toBe(storedSafe)
        expect(visualBroken, `seed ${seed} row ${row.row} broken visuals`).toBe(GRID_COLS - storedSafe)
      }
    }
  })

  it('the actual configured generator curve is preserved in src/config/game.ts', () => {
    expect(SAFE_CELL_CURVE).toEqual(ROWS.map((row) => row.safeCells))
    // The visual layer must not reinterpret stored values: visualSafe == stored "1".
    expect(boardVisualForValue('1')).toBe('safe')
    expect(boardVisualForValue('0')).toBe('bomb')
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

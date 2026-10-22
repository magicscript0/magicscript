import { describe, expect, it } from 'vitest'
import { M_KEYS } from '../config/game'
import type { M11Node } from '../types/game'
import { generateDemoRound } from './generator'
import { evaluateM11Snapshot, liveValuesToRows } from './m11Snapshot'

/** Hand-built valid node (independent of the generator). */
function validNode(): M11Node {
  const node = {} as Record<string, Record<string, '0' | '1'>>
  for (const key of M_KEYS) node[key] = { [key]: '1' }
  return node as unknown as M11Node
}

/** Raw wire format of a node (what onValue's snapshot.val() yields). */
function toRaw(node: M11Node): Record<string, unknown> {
  return Object.fromEntries(M_KEYS.map((key) => [key, node[key]]))
}

describe('evaluateM11Snapshot — valid payloads', () => {
  it('accepts a fully valid node with status "valid" and all 50 keys', () => {
    const result = evaluateM11Snapshot(toRaw(validNode()))
    expect(result.status).toBe('valid')
    expect(result.present).toHaveLength(50)
    expect(result.missing).toHaveLength(0)
    expect(result.invalid).toHaveLength(0)
    expect(result.safeCount).toBe(50)
  })

  it('accepts every generated demo round as valid and counts safe cells', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = evaluateM11Snapshot(toRaw(generateDemoRound(seed).node))
      expect(result.status).toBe('valid')
      expect(result.safeCount).toBe(20) // curve 1,1,1,1,2,2,2,3,3,4
    }
  })

  it('records the observed "0"/"1" values for the UI', () => {
    const result = evaluateM11Snapshot(toRaw(generateDemoRound(9).node))
    for (const key of M_KEYS) {
      expect(result.values[key] === '0' || result.values[key] === '1').toBe(true)
    }
  })

  it('ignores extra unknown keys (same tolerance as the Android client)', () => {
    const raw = toRaw(validNode())
    raw.other = 'surprise'
    const result = evaluateM11Snapshot(raw)
    expect(result.status).toBe('valid')
    expect(result.missing).toHaveLength(0)
  })
})

describe('evaluateM11Snapshot — empty payloads', () => {
  it('classifies null (nonexistent /m11) as empty', () => {
    const result = evaluateM11Snapshot(null)
    expect(result.status).toBe('empty')
    expect(result.present).toHaveLength(0)
    expect(result.missing).toHaveLength(50)
    expect(result.safeCount).toBe(0)
  })

  it('classifies an empty object as empty', () => {
    expect(evaluateM11Snapshot({}).status).toBe('empty')
  })

  it('classifies non-object payloads (array, string, number) as empty', () => {
    expect(evaluateM11Snapshot(['m1']).status).toBe('empty')
    expect(evaluateM11Snapshot('nope').status).toBe('empty')
    expect(evaluateM11Snapshot(42).status).toBe('empty')
  })
})

describe('evaluateM11Snapshot — missing mN keys', () => {
  it('reports exactly which keys are missing (incomplete)', () => {
    const raw = toRaw(validNode())
    delete raw.m17
    delete raw.m42
    const result = evaluateM11Snapshot(raw)
    expect(result.status).toBe('incomplete')
    expect(result.missing).toEqual(['m17', 'm42'])
    expect(result.present).toHaveLength(48)
    expect(result.invalid).toHaveLength(0)
  })

  it('never invents values for missing keys', () => {
    const raw = toRaw(validNode())
    delete raw.m1
    const result = evaluateM11Snapshot(raw)
    expect(result.values.m1).toBeUndefined()
  })

  it('classifies a node with only one key present as incomplete, not empty', () => {
    const result = evaluateM11Snapshot({ m50: { m50: '1' } })
    expect(result.status).toBe('incomplete')
    expect(result.missing).toHaveLength(49)
  })
})

describe('liveValuesToRows — /m11 snapshot → grid mapping', () => {
  it('maps a complete valid snapshot to exactly 50 cells in row order (m1…m50)', () => {
    const values: Partial<Record<(typeof M_KEYS)[number], '0' | '1'>> = {}
    for (const key of M_KEYS) values[key] = '0'
    values.m1 = '1'

    const rows = liveValuesToRows(values)
    expect(rows).toHaveLength(10)
    const cells = rows.flatMap((row) => row.cells)
    expect(cells).toHaveLength(50)
    expect(cells.map((cell) => cell.key)).toEqual([...M_KEYS])
    expect(cells.filter((cell) => cell.value === '1').map((cell) => cell.key)).toEqual(['m1'])
    // Row mapping: row N owns m(5N-4)…m(5N) with its multiplier attached.
    expect(rows[0].row).toBe(1)
    expect(rows[0].multiplier).toBe(1.23)
    expect(rows[0].cells.map((cell) => cell.key)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    expect(rows[9].cells.map((cell) => cell.key)).toEqual(['m46', 'm47', 'm48', 'm49', 'm50'])
    expect(rows[9].multiplier).toBe(349.68)
  })

  it('round-trips the Phase-4 live snapshot through the evaluator into rows unchanged', () => {
    const live = Object.fromEntries(
      M_KEYS.map((key, index) => [key, { [key]: index % 3 === 0 ? '1' : '0' }]),
    )
    const evaluation = evaluateM11Snapshot(live)
    expect(evaluation.status).toBe('valid')
    const rows = liveValuesToRows(evaluation.values)
    for (const row of rows) {
      for (const cell of row.cells) {
        expect(cell.value).toBe(live[cell.key][cell.key])
      }
    }
  })

  it('refuses to map an incomplete value map (never invents cells)', () => {
    const values: Partial<Record<(typeof M_KEYS)[number], '0' | '1'>> = {}
    for (const key of M_KEYS) values[key] = '0'
    delete values.m25
    expect(() => liveValuesToRows(values)).toThrow(/missing a value for "m25"/)
  })
})

describe('evaluateM11Snapshot — invalid values and shapes', () => {
  it('flags numeric values as invalid (contract requires STRINGS)', () => {
    const raw = toRaw(validNode())
    raw.m4 = { m4: 1 }
    raw.m8 = { m8: 0 }
    const result = evaluateM11Snapshot(raw)
    expect(result.status).toBe('invalid')
    expect(result.invalid).toEqual(['m4', 'm8'])
    expect(result.missing).toHaveLength(0)
  })

  it('flags booleans and illegal strings as invalid', () => {
    const raw = toRaw(validNode())
    raw.m2 = { m2: true }
    raw.m6 = { m6: '2' }
    raw.m10 = { m10: '' }
    raw.m14 = { m14: null }
    const result = evaluateM11Snapshot(raw)
    expect(result.status).toBe('invalid')
    expect(result.invalid).toEqual(['m2', 'm6', 'm10', 'm14'])
  })

  it('flags a bare value without the { mN: … } wrapper as invalid', () => {
    const raw = toRaw(validNode())
    raw.m5 = '1'
    expect(evaluateM11Snapshot(raw).invalid).toEqual(['m5'])
  })

  it('flags a mismatched inner key as invalid', () => {
    const raw = toRaw(validNode())
    raw.m3 = { m4: '1' }
    expect(evaluateM11Snapshot(raw).invalid).toEqual(['m3'])
  })

  it('flags a wrapper with multiple entries as invalid', () => {
    const raw = toRaw(validNode())
    raw.m12 = { m12: '1', m13: '0' }
    expect(evaluateM11Snapshot(raw).invalid).toEqual(['m12'])
  })

  it('excludes invalid keys from the recorded values and safe count', () => {
    const raw = toRaw(validNode())
    raw.m1 = { m1: 1 } // would be safe if valid — must not count
    const result = evaluateM11Snapshot(raw)
    expect(result.values.m1).toBeUndefined()
    expect(result.safeCount).toBe(49)
  })

  it('reports both invalid and missing keys when both problems exist', () => {
    const raw = toRaw(validNode())
    raw.m7 = { m7: 'yes' }
    delete raw.m22
    delete raw.m23
    const result = evaluateM11Snapshot(raw)
    expect(result.status).toBe('invalid') // integrity problem takes precedence
    expect(result.invalid).toEqual(['m7'])
    expect(result.missing).toEqual(['m22', 'm23'])
  })
})

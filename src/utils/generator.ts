import { GRID_COLS, M_KEYS, ROWS } from '../config/game'
import type { DemoRound, M11ChildRecord, M11Node, M11Value, MKey, RowView } from '../types/game'
import { validateM11Node } from './validation'

/** Deterministic PRNG (mulberry32): the same seed always reproduces a round. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks `count` distinct indexes from 0…max-1 (partial Fisher–Yates shuffle). */
function pickDistinctIndexes(rng: () => number, max: number, count: number): Set<number> {
  const pool = Array.from({ length: max }, (_, index) => index)
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(rng() * (max - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return new Set(pool.slice(0, count))
}

/** Builds the exact firebase-compatible shape: { mN: { mN: "0"|"1" } }. */
function buildNode(values: ReadonlyMap<MKey, M11Value>): M11Node {
  const node = {} as Record<string, { [key: string]: M11Value }>
  for (const key of M_KEYS) {
    const value = values.get(key)
    if (value === undefined) {
      throw new Error(`Generator failed to produce a value for "${key}".`)
    }
    node[key] = { [key]: value }
  }
  return node as M11Node
}

/** Derives the 10-row UI view model from a node (row 1 first). */
export function nodeToRows(node: M11Node): RowView[] {
  return ROWS.map((spec) => ({
    row: spec.row,
    multiplier: spec.multiplier,
    cells: spec.keys.map((key) => ({ key, value: (node[key] as M11ChildRecord)[key] })),
  }))
}

/**
 * Generates one complete DEMO round.
 *
 * Curve parity with the original operator app: rows 1–10 receive exactly
 * 1, 1, 1, 1, 2, 2, 2, 2, 2, 4 safe cells ("1"), uniformly placed.
 *
 * The result is validated against the /m11 contract BEFORE it is returned,
 * so a generated round can never be missing positions or malformed.
 */
export function generateDemoRound(seed: number = Date.now()): DemoRound {
  const rng = createRng(seed)
  const values = new Map<MKey, M11Value>()

  for (const spec of ROWS) {
    const safeIndexes = pickDistinctIndexes(rng, GRID_COLS, spec.safeCells)
    spec.keys.forEach((key, index) => {
      values.set(key, safeIndexes.has(index) ? '1' : '0')
    })
  }

  if (values.size !== M_KEYS.length) {
    throw new Error(`Generator produced ${values.size} positions instead of ${M_KEYS.length}.`)
  }

  const node = buildNode(values)
  const validation = validateM11Node(node)
  if (!validation.valid) {
    throw new Error(`Generated round failed contract validation: ${validation.errors.join(' ')}`)
  }

  return { seed, createdAt: Date.now(), node, rows: nodeToRows(node) }
}

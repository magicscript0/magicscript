import { M_KEYS, ROWS } from '../config/game'
import type { M11Value, MKey, RowView } from '../types/game'
import { validateM11Child } from './validation'

/** Aggregate sync status of the observed /m11 node. */
export type M11SyncStatus = 'empty' | 'invalid' | 'incomplete' | 'valid'

/** Pure evaluation of one raw /m11 snapshot — no Firebase, no side effects. */
export interface M11SyncEvaluation {
  readonly status: M11SyncStatus
  /** Keys present at /m11 (regardless of validity). */
  readonly present: readonly MKey[]
  /** Required keys absent from /m11. */
  readonly missing: readonly MKey[]
  /** Present keys whose payload violates the { mN: "0" | "1" } contract. */
  readonly invalid: readonly MKey[]
  /** Valid values only — keyed for the UI, never written back anywhere. */
  readonly values: Readonly<Partial<Record<MKey, M11Value>>>
  /** Count of valid "1" (safe) cells. */
  readonly safeCount: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Evaluates a raw snapshot of /m11 against the frozen contract.
 *
 * Read-only by construction: it merely classifies what was received.
 * It never repairs, initializes, defaults, or normalizes anything —
 * missing/invalid data is REPORTED, not fixed.
 *
 * Status precedence: empty → invalid → incomplete → valid.
 * Extra unknown keys are ignored (the Android demo client ignores them too).
 */
export function evaluateM11Snapshot(raw: unknown): M11SyncEvaluation {
  const source = isPlainObject(raw) ? raw : null

  const present: MKey[] = []
  const missing: MKey[] = []
  const invalid: MKey[] = []
  const values: Partial<Record<MKey, M11Value>> = {}
  let safeCount = 0

  for (const key of M_KEYS) {
    if (source === null || !(key in source)) {
      missing.push(key)
      continue
    }
    present.push(key)
    const result = validateM11Child(key, source[key])
    if (result.valid) {
      values[key] = result.value
      if (result.value === '1') safeCount += 1
    } else {
      invalid.push(key)
    }
  }

  const status: M11SyncStatus =
    present.length === 0
      ? 'empty'
      : invalid.length > 0
        ? 'invalid'
        : missing.length > 0
          ? 'incomplete'
          : 'valid'

  return { status, present, missing, invalid, values, safeCount }
}

/**
 * Maps an observed (validated) /m11 snapshot to the 10-row grid view —
 * the exact same m1…m50 → row/column mapping the grid uses for local
 * rounds, so a live round and APP 2 render identical cells.
 *
 * Only complete value maps are accepted (status "valid"): if any of the
 * 50 keys is missing, this throws rather than inventing a value.
 */
export function liveValuesToRows(
  values: Readonly<Partial<Record<MKey, M11Value>>>,
): RowView[] {
  return ROWS.map((spec) => ({
    row: spec.row,
    multiplier: spec.multiplier,
    cells: spec.keys.map((key) => {
      const value = values[key]
      if (value === undefined) {
        throw new Error(
          `Live /m11 snapshot is missing a value for "${key}" — refusing to invent one.`,
        )
      }
      return { key, value }
    }),
  }))
}

import { M_KEYS, ROWS } from '../config/game'
import type { M11ChildRecord, M11Node, M11Value } from '../types/game'

export type Validation = { valid: true } | { valid: false; errors: string[] }

/** The only legal cell values in the contract: the STRINGS "0" and "1". */
export function isM11Value(value: unknown): value is '0' | '1' {
  return value === '0' || value === '1'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

export type ChildValidation =
  | { valid: true; value: M11Value }
  | { valid: false; error: string }

/**
 * Validates ONE child of /m11 against the frozen contract:
 *   /m11/mN must store { mN: "0" | "1" } — object with exactly one entry,
 *   whose key equals the child name and whose value is the STRING "0"/"1".
 * Shared by the whole-node validator and the live read-only mirror.
 */
export function validateM11Child(key: string, child: unknown): ChildValidation {
  if (!isRecord(child)) {
    return {
      valid: false,
      error: `"${key}" must be an object like { "${key}": "0" | "1" }, got ${describe(child)}.`,
    }
  }
  const childKeys = Object.keys(child)
  if (childKeys.length !== 1) {
    return {
      valid: false,
      error: `"${key}" must contain exactly one entry, got ${childKeys.length}.`,
    }
  }
  const innerKey = childKeys[0]
  if (innerKey !== key) {
    return {
      valid: false,
      error: `"${key}" has a mismatched inner key "${innerKey}".`,
    }
  }
  if (!isM11Value(child[innerKey])) {
    return {
      valid: false,
      error: `"${key}" must be the string "0" or "1", got ${describe(child[innerKey])}.`,
    }
  }
  return { valid: true, value: child[innerKey] }
}

/**
 * Validates a full /m11 node against the demo contract:
 *  - exactly the 50 keys m1…m50 (no missing keys, no extras)
 *  - every child is an object with exactly ONE entry
 *  - that entry's key equals the child name (e.g. /m11/m3 stores { m3: "1" })
 *  - the value is the STRING "0" or "1" (never number/boolean/object)
 */
export function validateM11Node(node: unknown): Validation {
  if (!isRecord(node)) {
    return { valid: false, errors: ['The round must be an object.'] }
  }

  const errors: string[] = []

  for (const key of M_KEYS) {
    if (!(key in node)) {
      errors.push(`Missing key "${key}".`)
      continue
    }
    const result = validateM11Child(key, node[key])
    if (!result.valid) {
      errors.push(result.error)
    }
  }

  const knownKeys = new Set<string>(M_KEYS)
  const extras = Object.keys(node).filter((key) => !knownKeys.has(key))
  if (extras.length > 0) {
    errors.push(`Unexpected extra keys: ${extras.join(', ')}.`)
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

/** Safe ("1") cell count per row, in row order — used by tests and the UI summary. */
export function rowSafeCounts(node: M11Node): number[] {
  return ROWS.map((row) =>
    row.keys.filter((key) => (node[key] as M11ChildRecord)[key] === '1').length,
  )
}

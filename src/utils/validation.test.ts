import { describe, expect, it } from 'vitest'
import { M_KEYS } from '../config/game'
import type { M11Node } from '../types/game'
import { generateDemoRound } from './generator'
import { isM11Value, validateM11Node } from './validation'

/** Hand-built canonical valid node (independent of the generator). */
function validNode(): M11Node {
  const node = {} as Record<string, Record<string, '0' | '1'>>
  for (const key of M_KEYS) {
    node[key] = { [key]: '1' }
  }
  return node as unknown as M11Node
}

describe('isM11Value', () => {
  it('accepts only the strings "0" and "1"', () => {
    expect(isM11Value('0')).toBe(true)
    expect(isM11Value('1')).toBe(true)
    expect(isM11Value(1)).toBe(false)
    expect(isM11Value(0)).toBe(false)
    expect(isM11Value(true)).toBe(false)
    expect(isM11Value('2')).toBe(false)
    expect(isM11Value('')).toBe(false)
    expect(isM11Value(null)).toBe(false)
    expect(isM11Value(undefined)).toBe(false)
    expect(isM11Value({ m1: '1' })).toBe(false)
  })
})

describe('validateM11Node', () => {
  it('accepts a valid, complete node', () => {
    expect(validateM11Node(validNode())).toEqual({ valid: true })
  })

  it('accepts every generated round', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(validateM11Node(generateDemoRound(seed).node)).toEqual({ valid: true })
    }
  })

  it('rejects a node with a missing key', () => {
    const node = validNode() as unknown as Record<string, unknown>
    delete node.m17
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((message) => message.includes('Missing key "m17"'))).toBe(true)
    }
  })

  it('rejects a node with ALL keys missing (empty object)', () => {
    const result = validateM11Node({})
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveLength(50)
  })

  it('rejects non-object nodes', () => {
    expect(validateM11Node(null).valid).toBe(false)
    expect(validateM11Node(undefined).valid).toBe(false)
    expect(validateM11Node('m11').valid).toBe(false)
    expect(validateM11Node(50).valid).toBe(false)
    expect(validateM11Node([1, 2, 3]).valid).toBe(false)
  })

  it('rejects malformed children (value instead of wrapper object)', () => {
    const node = validNode() as unknown as Record<string, unknown>
    node.m5 = '1' // missing the { m5: "1" } wrapper
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((message) => message.includes('"m5" must be an object'))).toBe(true)
    }
  })

  it('rejects invalid inner values (numbers, booleans, bad strings)', () => {
    for (const bad of [1, 0, true, '2', '', null]) {
      const node = validNode() as unknown as Record<string, unknown>
      node.m9 = { m9: bad }
      const result = validateM11Node(node)
      expect(result.valid, `value ${JSON.stringify(bad)} should be rejected`).toBe(false)
      if (!result.valid) {
        expect(
          result.errors.some((message) => message.includes('"m9" must be the string')),
        ).toBe(true)
      }
    }
  })

  it('rejects a mismatched inner key (m3 wrapper holding m4)', () => {
    const node = validNode() as unknown as Record<string, unknown>
    node.m3 = { m4: '1' }
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((message) => message.includes('mismatched inner key'))).toBe(true)
    }
  })

  it('rejects children with more than one entry', () => {
    const node = validNode() as unknown as Record<string, unknown>
    node.m12 = { m12: '1', m13: '0' }
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((message) => message.includes('exactly one entry'))).toBe(true)
    }
  })

  it('rejects unexpected extra keys alongside the 50 required ones', () => {
    const node = validNode() as unknown as Record<string, unknown>
    node.m51 = { m51: '1' }
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((message) => message.includes('m51'))).toBe(true)
    }
  })

  it('collects multiple errors at once', () => {
    const node = validNode() as unknown as Record<string, unknown>
    delete node.m1
    delete node.m50
    node.m25 = { wrong: '1' }
    const result = validateM11Node(node)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

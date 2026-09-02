import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateDemoRound } from '../utils/generator'
import { validateM11Node } from '../utils/validation'
import type { M11Node } from '../types/game'

const updateMock = vi.hoisted(() => vi.fn())
const refMock = vi.hoisted(() => vi.fn((_db: unknown, path: string) => ({ path })))
const getDemoDatabaseMock = vi.hoisted(() => vi.fn(() => ({ key: 'demo-db' })))

vi.mock('firebase/database', () => ({
  onValue: () => () => undefined,
  ref: refMock,
  update: updateMock,
}))

vi.mock('./firebase', () => ({
  getDemoDatabase: getDemoDatabaseMock,
}))

import {
  InvalidRoundError,
  M11_PUBLISHING_ENABLED,
  assertM11ChildPath,
  publishDemoRound,
} from './m11'

/** Recursively collects non-test TS/TSX source files under a directory. */
function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function validNode(): M11Node {
  return generateDemoRound(1).node
}

beforeEach(() => {
  updateMock.mockReset()
  refMock.mockClear()
  getDemoDatabaseMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('M11 service — publishing (single guarded write path)', () => {
  it('has publishing enabled exclusively for the NEW GAME action', () => {
    expect(M11_PUBLISHING_ENABLED).toBe(true)
  })

  it('publishes a VALID round as ONE atomic update at the fixed path /m11', async () => {
    const node = validNode()
    await publishDemoRound(node)

    expect(getDemoDatabaseMock).toHaveBeenCalledTimes(1)
    expect(refMock).toHaveBeenCalledWith({ key: 'demo-db' }, 'm11')
    expect(updateMock).toHaveBeenCalledTimes(1)
    // The exact node passed in is the exact node written — never regenerated.
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), node)
  })

  it('publishes only a contract-valid node (validates BEFORE any SDK call)', async () => {
    const broken = validNode() as unknown as Record<string, unknown>
    delete broken.m27
    await expect(publishDemoRound(broken as unknown as M11Node)).rejects.toBeInstanceOf(
      InvalidRoundError,
    )
    expect(updateMock).not.toHaveBeenCalled()
    expect(refMock).not.toHaveBeenCalled()
    expect(getDemoDatabaseMock).not.toHaveBeenCalled()
  })

  it('the published payload itself passes the contract validator', async () => {
    const node = validNode()
    await publishDemoRound(node)
    const written = updateMock.mock.calls[0][1] as M11Node
    expect(validateM11Node(written)).toEqual({ valid: true })
    expect(Object.keys(written)).toHaveLength(50)
  })
})

describe('M11 service — static write audit', () => {
  it('contains exactly ONE Firebase write API in production code, in m11.ts', () => {
    const files = collectSourceFiles(resolve(process.cwd(), 'src'))
    expect(files.length).toBeGreaterThan(10)
    const generatorPath = resolve(process.cwd(), 'src/utils/generator.ts')
    const writeHits: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const writeTests: ReadonlyArray<[string, RegExp]> = [
        ['set(', /\.\s*set\s*\(/],
        ['update(', /(?:^|[^\w.])update\s*\(/],
        ['remove(', /\.\s*remove\s*\(/],
        ['runTransaction(', /runTransaction\s*\(/],
        ['onDisconnect', /onDisconnect/],
      ]
      for (const [label, pattern] of writeTests) {
        if (pattern.test(source)) {
          // Sole tolerated exception: the LOCAL JavaScript Map.set in the
          // generator (that file imports nothing from Firebase — verified
          // by the import-allowlist test below).
          if (file === generatorPath && label === 'set(') continue
          writeHits.push(`${file}: ${label}`)
        }
      }
    }
    // The single allowed Firebase write: update() in the guarded publish path.
    expect(writeHits).toEqual([expect.stringContaining('src/services/m11.ts: update(')])
  })

  it('never uses destructive or background-write APIs anywhere (set/remove/transaction/onDisconnect)', () => {
    const files = collectSourceFiles(resolve(process.cwd(), 'src'))
    const generatorPath = resolve(process.cwd(), 'src/utils/generator.ts')
    const generatorSource = readFileSync(generatorPath, 'utf-8')
    // generator.ts has zero Firebase imports — its .set( is a local Map method.
    expect(generatorSource).not.toMatch(/^import\s+.*firebase/m)
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      if (file !== generatorPath) {
        expect(source, `${file} must not call .set()`).not.toMatch(/\.\s*set\s*\(/)
      }
      expect(source, `${file} must not call .remove()`).not.toMatch(/\.\s*remove\s*\(/)
      expect(source, `${file} must not reference transactions`).not.toContain('runTransaction')
      expect(source, `${file} must not register disconnect handlers`).not.toContain(
        'onDisconnect',
      )
    }
  })

  it('the connection/firebase service stays strictly read-only', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/firebase.ts'), 'utf-8')
    expect(source).not.toMatch(/\.\s*update\s*\(/)
    const importLine = source.split('\n').find((line) => line.includes("from 'firebase/database'"))
    expect(importLine).not.toContain('update')
  })

  it('firebase/database imports are limited to the read + single-update allowlist', () => {
    const allowed = new Set([
      'onValue', 'get', 'getDatabase', 'ref', 'query', 'update',
      'Unsubscribe', 'DataSnapshot', 'Database', 'onChildAdded', 'onChildChanged',
    ])
    const files = collectSourceFiles(resolve(process.cwd(), 'src'))
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const importMatch = source.match(
        /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'firebase\/database'/,
      )
      if (!importMatch) continue
      const identifiers = importMatch[1]
        .split(',')
        .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      for (const identifier of identifiers) {
        expect(
          allowed.has(identifier),
          `${file} imports "${identifier}" from firebase/database — not in the allowlist`,
        ).toBe(true)
      }
    }
  })

  it('no REST write calls (fetch/XHR POST/PUT/PATCH) to Firebase in production code', () => {
    const files = collectSourceFiles(resolve(process.cwd(), 'src'))
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      expect(source, `${file} must not call fetch()`).not.toMatch(/\bfetch\s*\(/)
      expect(source, `${file} must not use XHR`).not.toContain('XMLHttpRequest')
      expect(source, `${file} must not REST-write`).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/)
    }
  })
})

describe('M11 service — path guard', () => {
  it('accepts exactly the 50 legal child paths /m11/m1 … /m11/m50', () => {
    for (let n = 1; n <= 50; n += 1) {
      expect(() => assertM11ChildPath(`m11/m${n}`)).not.toThrow()
    }
  })

  it('rejects every forbidden top-level node with a clear error', () => {
    for (const forbidden of ['main', 'xbetmoney', 'users', 'bet1', 'data']) {
      expect(() => assertM11ChildPath(`${forbidden}/anything`)).toThrow(/forbidden/i)
    }
  })

  it('rejects unknown nodes, nested paths and non-m11 keys', () => {
    expect(() => assertM11ChildPath('m11/m51')).toThrow(/Illegal database path/)
    expect(() => assertM11ChildPath('other/m1')).toThrow(/Illegal database path/)
    expect(() => assertM11ChildPath('m11')).toThrow(/Illegal database path/)
    expect(() => assertM11ChildPath('m11/m1/m2')).toThrow(/Illegal database path/)
    expect(() => assertM11ChildPath('')).toThrow(/Illegal database path/)
  })
})

import { describe, expect, it } from 'vitest'
import {
  FIREBASE_ENV,
  FORBIDDEN_TOP_LEVEL_PATHS,
  M11_PATH,
  REQUIRED_FIREBASE_ENV,
} from '../config/firebase'

describe('firebase config contract', () => {
  it('pins the demo node path to /m11', () => {
    expect(M11_PATH).toBe('m11')
  })

  it('names exactly the 7 VITE_FIREBASE_* variables', () => {
    const names = Object.values(FIREBASE_ENV)
    expect(names).toHaveLength(7)
    expect(names.every((name) => name.startsWith('VITE_FIREBASE_'))).toBe(true)
  })

  it('requires exactly the database URL for the read-only RTDB integration', () => {
    expect(REQUIRED_FIREBASE_ENV).toEqual([FIREBASE_ENV.databaseURL])
  })

  it('forbids every node owned by the demo Android client', () => {
    expect([...FORBIDDEN_TOP_LEVEL_PATHS]).toEqual(
      expect.arrayContaining(['main', 'xbetmoney', 'users', 'bet1', 'data']),
    )
  })
})

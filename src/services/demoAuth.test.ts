import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkDemoPassword, getDemoPassword } from './demoAuth'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('demo gate configuration', () => {
  it('defaults to the harmless demo passcode when no env var is set', () => {
    expect(getDemoPassword()).toBe('demo-access')
    expect(checkDemoPassword('demo-access')).toBe(true)
  })

  it('honours VITE_DEMO_PASSWORD when configured', () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', '  custom-demo-pass  ')
    expect(getDemoPassword()).toBe('custom-demo-pass')
    expect(checkDemoPassword('custom-demo-pass')).toBe(true)
  })

  it('falls back to the demo default when the env var is set to whitespace', () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', '   ')
    expect(getDemoPassword()).toBe('demo-access')
  })

  it('NEVER accepts the original Android password "MAGIC" under the default config', () => {
    // The original app's shared secret must not work anywhere in the demo
    // unless an operator deliberately chooses it in their own .env.
    expect(checkDemoPassword('MAGIC')).toBe(false)
    expect(checkDemoPassword('magic')).toBe(false)
  })

  it('does not hardcode "MAGIC" anywhere in the gate source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/demoAuth.ts'), 'utf-8')
    expect(source).not.toContain('MAGIC')
  })
})

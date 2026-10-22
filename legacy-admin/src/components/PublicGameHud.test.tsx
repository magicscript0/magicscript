import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LocalTimeChip, OnlineActivityChip, PublicGameHud } from './PublicGameHud'
import { formatLocalDateTime } from '../utils/localClock'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import type { DisplaySettings } from '../types/supabase'

/**
 * The public HUD is positioned entirely in CSS. These tests pin the CSS
 * layout contract in src/index.css so the two required corner positions and
 * the no-truncation rule for the clock cannot silently regress:
 *
 *   TOP RIGHT — local date + time     TOP LEFT — live activity estimate
 */

const CSS = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function display(overrides: Partial<DisplaySettings> = {}): DisplaySettings {
  return { ...DEFAULT_CONTROL_SETTINGS.display, ...overrides }
}

describe('public HUD layout contract (src/index.css)', () => {
  it('splits the login HUD across the two top corners', () => {
    const block = CSS.match(/\.pg-hud--login\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('position: absolute')
    expect(block).toContain('justify-content: space-between')
  })

  it('offsets the HUD with safe-area insets on all sides it touches', () => {
    const block = CSS.match(/\.pg-hud--login\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('top: max(14px, calc(env(safe-area-inset-top) + 10px))')
    expect(block).toContain('right: max(16px, env(safe-area-inset-right))')
    expect(block).toContain('left: max(16px, env(safe-area-inset-left))')
  })

  it('keeps the clock pinned to the right even when it is the only chip', () => {
    expect(CSS).toMatch(/\.pg-hud \.pg-pill--clock\s*\{[^}]*margin-left:\s*auto/s)
  })

  it('never caps or truncates the clock value', () => {
    const block = CSS.match(/\.pg-pill--clock \.pg-pill__value\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('max-width: none')
    // The generic pill cap must not re-apply to the clock on tiny screens:
    // the narrow-screen cap targets every pill EXCEPT the clock.
    const narrow = CSS.match(/@media \(max-width: 379px\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(narrow).toContain('.pg-pill:not(.pg-pill--clock)')
    expect(narrow).not.toMatch(/\.pg-hud \.pg-pill__value\s*\{\s*max-width:\s*130px/)
  })

  it('clears the HUD strip above the login content on narrow screens', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 767px\)\s*\{\s*\.pg-login\s*\{[^}]*padding-top:\s*max\(46px, calc\(env\(safe-area-inset-top\) \+ 46px\)\)/,
    )
  })

  it('mirrors the production corner layout in the admin preview', () => {
    expect(CSS).toMatch(/\.pg-preview > \.pg-hud\s*\{[^}]*justify-content:\s*space-between/s)
  })
})

describe('public HUD rendering', () => {
  const FIXED = new Date('2026-09-10T20:46:00')

  it('renders activity as the first (left) chip and the clock as the last (right) chip', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED)
    render(<PublicGameHud display={display()} />)
    const hud = screen.getByTestId('public-hud')
    const chips = hud.querySelectorAll('.pg-pill')
    expect(chips[0]).toHaveClass('pg-pill--activity')
    expect(chips[1]).toHaveClass('pg-pill--clock')
  })

  it('renders the visitor-local date + time in full, minute precision, no seconds', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED)
    render(<LocalTimeChip display={display({ localTimeClock: '12h' })} />)
    const chip = screen.getByLabelText(/local time/i)
    expect(chip.textContent).toBe(formatLocalDateTime(FIXED, '12h'))
    expect(chip.textContent).toMatch(/\d{2}:\d{2} (AM|PM)$/)
    expect(chip.textContent).not.toMatch(/:\d{2}:\d{2}/)
  })

  it('renders the activity estimate with the LIVE ACTIVITY key', () => {
    render(<OnlineActivityChip display={display({ onlineCountMode: 'fixed', onlineCountFixed: 42 })} />)
    expect(screen.getByText('Live activity')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders nothing when both indicators are disabled', () => {
    render(<PublicGameHud display={display({ onlineCountEnabled: false, localTimeEnabled: false })} />)
    expect(screen.queryByTestId('public-hud')).toBeNull()
  })

  it('renders the clock alone on the right when the activity chip is disabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED)
    render(<PublicGameHud display={display({ onlineCountEnabled: false })} />)
    const hud = screen.getByTestId('public-hud')
    expect(hud.querySelectorAll('.pg-pill')).toHaveLength(1)
    expect(hud.querySelector('.pg-pill--clock')).not.toBeNull()
  })
})

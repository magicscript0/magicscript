import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Fortune } from '../pages/Fortune'
import { GameIntro, resetGameIntroState } from '../components/GameIntro'
import { GRID_ROWS, M_KEYS, REVEAL_ROW_DELAY_MS } from '../config/game'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'
import type { M11Node } from '../types/game'

/**
 * MOBILE PERFORMANCE CONTRACT.
 *
 * These are the measurable parts of the smoothness pass: how much React is
 * allowed to do per second, how much of the board a single reveal step may
 * touch, and which CSS properties the public layer is allowed to animate. They
 * exist so a future change cannot silently reintroduce an animated `width`, a
 * per-frame gradient transition across fifty tiles, or a full-screen
 * `backdrop-filter` parked on top of the particle field.
 *
 * Nothing here measures a device — no browser is available in CI — so the
 * assertions are on the two things that decide frame time on a phone: the
 * number of component renders per interaction, and the class of CSS property
 * that is being animated.
 */

/* ------------------------------------------------------------------ */
/* Glyph render counter — every board cell renders exactly one glyph.   */
/* ------------------------------------------------------------------ */

const glyphRenders = vi.hoisted(() => ({ Apple: 0, Bomb: 0 }))

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  const { createElement } = await import('react')
  const track = (name: 'Apple' | 'Bomb') => {
    const Original = actual[name]
    return function TrackedGlyph(props: Record<string, unknown>) {
      glyphRenders[name] += 1
      return createElement(Original, props)
    }
  }
  return { ...actual, Apple: track('Apple'), Bomb: track('Bomb') }
})

/* ------------------------------------------------------------------ */
/* Firebase harness — the same contract Fortune.test.tsx runs against.  */
/* ------------------------------------------------------------------ */

const isConfiguredMock = vi.hoisted(() => vi.fn(() => true))
const subscribeMock = vi.hoisted(() => vi.fn())
const publishMock = vi.hoisted(() => vi.fn<(node: M11Node) => Promise<void>>())

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: isConfiguredMock,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => ({ fake: true }),
}))

vi.mock('../services/m11', () => ({
  subscribeToM11Sync: subscribeMock,
  publishDemoRound: publishMock,
}))

type SyncHandlers = {
  onUpdate?: (update: { evaluation: ReturnType<typeof evaluateM11Snapshot>; receivedAt: number }) => void
  onError?: (error: unknown) => void
}

const listener = { current: null as SyncHandlers | null }

function rawSnapshot(safeKeys: readonly string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of M_KEYS) raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  return raw
}

function emitSnapshot(safeKeys: readonly string[], receivedAt = 1_000) {
  act(() => {
    listener.current?.onUpdate?.({ evaluation: evaluateM11Snapshot(rawSnapshot(safeKeys)), receivedAt })
  })
}

const SAFE_KEYS = ['m1', 'm3', 'm6', 'm8', 'm21', 'm22', 'm36', 'm37', 'm38', 'm46', 'm47', 'm48', 'm49']

function totalGlyphRenders(): number {
  return glyphRenders.Apple + glyphRenders.Bomb
}

beforeEach(() => {
  vi.useFakeTimers()
  resetGameIntroState()
  glyphRenders.Apple = 0
  glyphRenders.Bomb = 0
  isConfiguredMock.mockReset().mockReturnValue(true)
  publishMock.mockReset().mockImplementation(() => Promise.resolve())
  listener.current = null
  subscribeMock.mockReset().mockImplementation((handlers: SyncHandlers) => {
    listener.current = handlers
    return () => undefined
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ */
/* React: what a second, a snapshot and a reveal step are allowed to do */
/* ------------------------------------------------------------------ */

describe('public game — React work per interaction', () => {
  it('renders a live snapshot once: fifty cells, fifty glyph renders', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    const before = totalGlyphRenders()
    emitSnapshot(SAFE_KEYS)
    expect(screen.getAllByRole('img')).toHaveLength(50)
    // Every hidden tile renders one glyph, so a fresh snapshot costs exactly one
    // glyph render per cell — never a second pass over the ladder.
    expect(totalGlyphRenders() - before).toBe(50)
  })

  it('does not re-render a single cell for the once-per-second access countdown', () => {
    const view = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(SAFE_KEYS)
    const settled = totalGlyphRenders()

    // Exactly what GameArea does every second: a new remainingMs prop.
    view.rerender(<Fortune accountId="123456789" remainingMs={599_000} onExit={vi.fn()} />)
    view.rerender(<Fortune accountId="123456789" remainingMs={598_000} onExit={vi.fn()} />)

    expect(screen.getByText('9:58')).toBeInTheDocument()
    expect(totalGlyphRenders(), 'a countdown tick must never reach the 50 cells').toBe(settled)
  })

  it('does not rebuild the control deck for the countdown either', () => {
    const view = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(SAFE_KEYS)
    const revealButton = screen.getByRole('button', { name: /reveal prediction/i })
    const newGameButton = screen.getByRole('button', { name: /new game/i })

    view.rerender(<Fortune accountId="123456789" remainingMs={599_000} onExit={vi.fn()} />)

    // The very same DOM nodes: the deck bailed out instead of being rebuilt.
    expect(screen.getByRole('button', { name: /reveal prediction/i })).toBe(revealButton)
    expect(screen.getByRole('button', { name: /new game/i })).toBe(newGameButton)
  })

  it('reveals one row by touching that row (and the row that arms) only', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(SAFE_KEYS)
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))

    const before = totalGlyphRenders()
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
    const step = totalGlyphRenders() - before

    // Five resolved tiles plus, on later steps, the five tiles of the row that
    // becomes armed. Anything near fifty here means the ladder is being rebuilt.
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(10)
  })

  it('presses Reveal without touching a single one of the fifty tiles', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(SAFE_KEYS)
    const settled = totalGlyphRenders()
    const markup = screen.getAllByRole('img').map((cell) => cell.outerHTML).join('|')

    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))

    /* The press only flips the phase and starts the scan. The pop-in belongs to
     * a tile *becoming resolved* rather than to a phase, so the fifty hidden
     * tiles bail out of the commit entirely: same nodes, same markup, no glyph
     * renders. Under the old phase-driven `animate` prop this single click was
     * the most expensive commit of the whole reveal (50 re-renders). */
    expect(totalGlyphRenders(), 'pressing Reveal must not re-render the board').toBe(settled)
    expect(screen.getAllByRole('img').map((cell) => cell.outerHTML).join('|')).toBe(markup)
    expect(document.querySelectorAll('.animate-pop-in')).toHaveLength(0)
  })

  it('keeps a whole ten-row reveal inside a bounded number of cell renders', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    emitSnapshot(SAFE_KEYS)
    fireEvent.click(screen.getByRole('button', { name: /reveal prediction/i }))

    const before = totalGlyphRenders()
    for (let row = 0; row < GRID_ROWS; row += 1) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
      })
    }

    // Two rows' worth of tiles per step at most (the resolved row plus the row
    // that arms), against ten full boards if a step re-rendered every cell.
    expect(totalGlyphRenders() - before).toBeLessThanOrEqual(2 * 5 * GRID_ROWS)
    expect(screen.getAllByRole('img')).toHaveLength(50)
    // Every resolved tile still pops: the animation moved onto the tile's own
    // state, it did not disappear with the phase prop.
    expect(document.querySelectorAll('.fortune-cell.animate-pop-in')).toHaveLength(50)
  })

  it('drives the boot meter from a composited custom property, not from layout', () => {
    render(<GameIntro />)
    const meter = document.querySelector<HTMLElement>('.pg-meter')
    const fill = document.querySelector<HTMLElement>('.pg-meter__fill')
    const head = document.querySelector<HTMLElement>('.pg-meter__head')

    expect(meter?.style.getPropertyValue('--pg-meter-p')).not.toBe('')
    // Animating width/left runs a layout pass on every tick of the curtain.
    expect(fill?.style.width).toBe('')
    expect(head?.style.left).toBe('')

    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(Number(screen.getByText(/^\d+%$/).textContent?.replace('%', ''))).toBeGreaterThan(30)
  })

  it('keeps the ambient field memoized and frame-rate independent', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/CyberBackdrop.tsx'), 'utf-8')
    // Memoized: a countdown tick or a mirror update must never re-render, let
    // alone restart, the particle field.
    expect(source).toMatch(/export const CyberBackdrop = memo\(/)
    // Delta-timed, throttled, and always cancelled: a 120Hz panel must not run
    // the field twice as fast, and the loop must not outlive the component.
    expect(source).toMatch(/FRAME_MS/)
    expect(source).toMatch(/frameBudget/)
    expect(source).toMatch(/cancelAnimationFrame/)
    // Particle stamps are baked, not rebuilt per frame.
    expect(source).toMatch(/bakeSprites/)
    expect(source).not.toMatch(/createRadialGradient\(particle/)
  })
})

/* ------------------------------------------------------------------ */
/* CSS: which properties the public layer is allowed to animate         */
/* ------------------------------------------------------------------ */

/** Comments are stripped first: prose inside a rule must not look like CSS. */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

interface CssRule {
  selector: string
  body: string
}

/** Leaf-rule scan; at-rule preludes are skipped, selector lists are split. */
function parseRules(source: string): CssRule[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, ' '),
    body: match[2],
  }))
}

function bodiesFor(selector: string, source = css): string[] {
  return parseRules(source)
    .filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector))
    .map((rule) => rule.body)
}

function bodyOf(selector: string, source = css): string {
  const found = bodiesFor(selector, source)
  expect(found.length, `index.css must contain a rule for "${selector}"`).toBeGreaterThan(0)
  return found.join('\n')
}

/** Property names appearing in any `transition` of a rule. */
function transitionedProperties(body: string): string[] {
  const names = new Set<string>()
  for (const declaration of body.match(/transition:[^;]+;/g) ?? []) {
    const value = declaration.slice('transition:'.length).replace(/;\s*$/, '')
    for (const part of value.split(',')) {
      const name = part.trim().split(/\s+/)[0]
      if (name !== '' && name !== 'none') names.add(name)
    }
  }
  return [...names]
}

/** Every at-rule block starting with `prelude`, nested braces included. */
function atRuleBlocks(prelude: string): string[] {
  const blocks: string[] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(prelude, from)
    if (start === -1) break
    let depth = 0
    for (let index = css.indexOf('{', start); index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') {
        depth -= 1
        if (depth === 0) {
          blocks.push(css.slice(start, index + 1))
          from = index + 1
          break
        }
      }
    }
    if (from <= start) break
  }
  return blocks
}

function atRuleBlock(prelude: string): string {
  const blocks = atRuleBlocks(prelude)
  expect(blocks.length, `index.css must contain ${prelude}`).toBeGreaterThan(0)
  return blocks.join('\n')
}

/**
 * Layout properties (a reflow per frame) and paint-only properties (a re-raster
 * per frame). Both are banned from the reveal path: the board moves with
 * `transform` and `opacity`, or it does not move at all.
 */
const EXPENSIVE_TRANSITIONS = [
  'width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding',
  'box-shadow', 'text-shadow', 'filter', 'background', 'background-image', 'background-position',
] as const

describe('public game — animation cost in index.css', () => {
  it('never transitions a layout or paint-only property on the board', () => {
    const selectors = [
      '.fortune-cell',
      '.fortune-cell__well',
      '.fortune-cell__glyph',
      '.fortune-chip',
      '.fortune-chip::after',
      '.fortune-rail::after',
    ]
    for (const selector of selectors) {
      const properties = transitionedProperties(bodyOf(selector))
      for (const banned of EXPENSIVE_TRANSITIONS) {
        expect(properties, `${selector} must not transition ${banned}`).not.toContain(banned)
      }
    }
  })

  it('moves the boot meter with transforms only', () => {
    for (const selector of ['.pg-meter__fill', '.pg-meter__head']) {
      expect(transitionedProperties(bodyOf(selector)), selector).toEqual(['transform'])
    }
    expect(bodyOf('.pg-meter__fill')).toMatch(/transform: scaleX\(var\(--pg-meter-p\)\)/)
    expect(bodyOf('.pg-meter__head')).toMatch(/translate3d\(calc\(var\(--pg-meter-p\) \* 100%\)/)
  })

  it('grows the ladder rail and the chip tick on the compositor', () => {
    expect(bodyOf('.fortune-rail::after')).toMatch(/transform: scaleY\(var\(--pg-rail/)
    expect(bodyOf('.fortune-chip::after')).toMatch(/transform-origin: 100% 50%/)
    expect(bodyOf('.fortune-chip--revealed::after')).toMatch(/transform: scaleX\(/)
  })

  it('carries the revealed-glyph glow on an opacity layer instead of a filter', () => {
    expect(bodyOf('.fortune-cell__glyph::before')).toMatch(/radial-gradient/)
    const filters = bodiesFor('.fortune-cell--safe .fortune-cell__glyph')
      .concat(bodiesFor('.fortune-cell--bomb .fortune-cell__glyph'))
      .join('\n')
      .match(/filter:[^;]+;/g) ?? []
    expect(filters.length).toBeGreaterThan(0)
    for (const filter of filters) {
      expect(filter.match(/drop-shadow/g)?.length ?? 0, filter).toBeLessThanOrEqual(1)
    }
  })

  it('warns about low time with an opacity ring, not an animated box-shadow', () => {
    expect(bodyOf('.pg-pill--timer.is-low::after')).toMatch(/animation: pg-warn-ring/)
    const keyframes = css.slice(css.indexOf('@keyframes pg-warn-ring'))
    expect(keyframes).toMatch(/0%, 100% \{ opacity: 0; \}/)
    expect(keyframes).toMatch(/50% \{ opacity: 1; \}/)
  })

  it('gives compact devices a lighter rendering path for the same composition', () => {
    const tier = atRuleBlock('@media (max-width: 1023px), (pointer: coarse)')

    // Glass without a per-frame blur: both surfaces sit above the animated
    // particle canvas, and both are 84–96% opaque anyway.
    expect(bodyOf('.pg-panel', tier)).toMatch(/backdrop-filter: none/)
    expect(bodyOf('.pg-idle__card', tier)).toMatch(/backdrop-filter: none/)

    // Blur cost grows with roughly the square of the radius.
    const compactBlur = Number(/blur\((\d+)px\)/.exec(bodyOf('.cyber-glow', tier))?.[1])
    const desktopBlur = Number(/blur\((\d+)px\)/.exec(bodyOf('.cyber-glow'))?.[1])
    expect(compactBlur).toBeGreaterThan(0)
    expect(compactBlur).toBeLessThan(desktopBlur)

    // No continuously animated masked full-screen planes, no unresolvable
    // scanline raster.
    expect(bodyOf('.cyber-shafts', tier)).toMatch(/animation: none/)
    expect(bodyOf('.cyber-grid-plane', tier)).toMatch(/animation: none/)
    expect(bodyOf('.pg-intro__floor-grid', tier)).toMatch(/animation: none/)
    expect(bodyOf('.cyber-scanlines', tier)).toMatch(/display: none/)

    // The tile keeps its neon identity with fewer rasterized shadow layers.
    expect(bodyOf('.fortune-cell--safe', tier)).toMatch(/box-shadow/)
    expect(bodyOf('.fortune-cell--bomb', tier)).toMatch(/box-shadow/)
    expect(bodyOf('.fortune-cell--safe .fortune-cell__glyph', tier)).toMatch(/filter: none/)

    // Elevation is re-stated; geometry never is.
    const tokens = bodyOf('.pg-game', tier)
    expect(tokens).toMatch(/--pg-shadow-card/)
    expect(tokens).toMatch(/--pg-shadow-tile/)
    expect(tokens).not.toMatch(/--pg-s-|--pg-r-|--pg-frame-|--pg-dock-h/)

  })

  it('locks the public game to the visible viewport with no page scroll', () => {
    expect(bodyOf('html')).toMatch(/text-size-adjust: 100%/)
    // Scoped to the public flow: the admin workspace keeps browser defaults.
    expect(bodyOf('html:has(.pg-flow)')).toMatch(/overscroll-behavior: none/)
    expect(bodyOf('body')).toMatch(/min-height: 100dvh/)
    expect(bodyOf('#root')).toMatch(/min-height: 100dvh/)
    expect(bodyOf('.fortune-screen')).toMatch(/height: 100dvh/)
    expect(bodyOf('.fortune-screen')).toMatch(/overflow: hidden/)
    // The stage surface may never leave a scrollable remainder behind it.
    const lock = bodyOf('html:has(.fortune-screen)')
    expect(lock).toMatch(/overflow: hidden/)
    expect(lock).toMatch(/height: 100dvh/)
    expect(bodyOf('html:has(.fortune-screen) body')).toMatch(/overflow: hidden/)
  })

  it('does not paint document decoration underneath the ambient field', () => {
    expect(bodyOf('body:has(.cyber-backdrop)')).toMatch(/background-image: none/)
    // `background-attachment: fixed` re-rasters the document background on
    // every scroll frame; the public flow never keeps it.
    expect(bodyOf('body:has(.cyber-backdrop)')).toMatch(/background-attachment: scroll/)
    expect(bodyOf('body:has(.cyber-backdrop)::before')).toMatch(/content: none/)
  })

  it('fits the physical screen through the safe-area insets', () => {
    const stage = bodyOf('.fortune-screen')
    expect(stage).toMatch(/env\(safe-area-inset-top\)/)
    expect(stage).toMatch(/env\(safe-area-inset-bottom\)/)
    expect(stage).toMatch(/env\(safe-area-inset-left\)/)
    expect(stage).toMatch(/env\(safe-area-inset-right\)/)
  })

  it('measures the fallback ladder against the dynamic viewport', () => {
    expect(atRuleBlock('@supports (height: 1dvh)')).toMatch(/--rh: calc\(\(100dvh/)
  })

  it('answers touch immediately on the public controls', () => {
    expect(bodyOf('.fortune-screen')).toMatch(/user-select: none/)
    expect(bodyOf('.pg-btn')).toMatch(/touch-action: manipulation/)
    expect(bodyOf('.pg-iconbtn')).toMatch(/touch-action: manipulation/)
    expect(bodyOf('.pg-btn')).toMatch(/-webkit-tap-highlight-color: transparent/)
  })

  it('flattens the new motion under prefers-reduced-motion', () => {
    const reduced = atRuleBlock('@media (prefers-reduced-motion: reduce)')
    expect(reduced).toMatch(/animation-duration: \.01ms !important/)
    expect(reduced).toMatch(/\.pg-pill--timer\.is-low::after/)
    expect(reduced).toMatch(/\.pg-meter__fill/)
    expect(reduced).toMatch(/\.fortune-chip::after/)
    expect(reduced).toMatch(/\.cyber-grid-plane/)
  })
})

describe('document shell', () => {
  it('opts into the unsafe area and lets the keyboard resize the layout viewport', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
    expect(html).toMatch(/width=device-width, initial-scale=1\.0/)
    expect(html).toMatch(/viewport-fit=cover/)
    expect(html).toMatch(/interactive-widget=resizes-content/)
  })
})

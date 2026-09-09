import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CyberBackdrop } from './CyberBackdrop'

/** Minimal 2D context so the particle paint path runs under jsdom. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() }
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CyberBackdrop', () => {
  it('renders a decorative, screen-reader-hidden backdrop with a particle canvas', () => {
    const { container } = render(<CyberBackdrop />)
    const backdrop = container.querySelector('.cyber-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop?.querySelector('canvas.cyber-particles')).not.toBeNull()
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
  })

  it('renders the calm density variant without crashing', () => {
    const { container } = render(<CyberBackdrop density="calm" />)
    expect(container.querySelector('.cyber-backdrop')).not.toBeNull()
  })
})

describe('CyberBackdrop mobile animation path', () => {
  interface SpyCtx {
    clearRect: ReturnType<typeof vi.fn>
    arc: ReturnType<typeof vi.fn>
    drawImage: ReturnType<typeof vi.fn>
    createRadialGradient: ReturnType<typeof vi.fn>
    setTransform: ReturnType<typeof vi.fn>
    [key: string]: unknown
  }

  let contexts: SpyCtx[]
  let rafCb: FrameRequestCallback | null
  let driveNow: number | null
  let randomIndex = 0
  let rafId = 0

  /**
   * Pinned particle stream so the field measurements are exact: every mote
   * lands on the near plane (depth 1, emerald tone) — the worst case for
   * halo cost, which is the cost the mobile path removes.
   */
  const RANDOM_SEQUENCE = [0, 1, 0.5, 0.5, 0, 1, 0, 1] as const

  function spyContext(): SpyCtx {
    return {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
    }
  }

  function setViewport(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
  }

  /** Drive the rAF loop with exact, controlled timestamps (no wall clock). */
  function driveFrames(count: number, stepMs: number, startMs = 0) {
    let now = startMs
    for (let i = 0; i < count; i += 1) {
      now += stepMs
      driveNow = now
      const cb = rafCb
      rafCb = null
      cb?.(now)
    }
  }

  beforeEach(() => {
    contexts = []
    rafCb = null
    driveNow = null
    randomIndex = 0
    vi.spyOn(Math, 'random').mockImplementation(() => RANDOM_SEQUENCE[randomIndex++ % RANDOM_SEQUENCE.length] as number)
    const originalNow = performance.now.bind(performance)
    vi.spyOn(performance, 'now').mockImplementation(() => (driveNow === null ? originalNow() : driveNow))
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      return ++rafId
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafCb = null
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const ctx = spyContext()
      contexts.push(ctx)
      return ctx as unknown as CanvasRenderingContext2D
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds a visible-but-light mobile field (fewer motes, sprite halos, zero per-frame gradients)', () => {
    // iPhone-sized viewport, the calm field the game board uses.
    setViewport(390, 844)
    const { unmount } = render(<CyberBackdrop density="calm" />)
    const ctx = contexts[0]
    // One deterministic mobile count for this viewport: the field floor
    // keeps the scene spatially alive on a small screen.
    expect(ctx.clearRect.mock.calls.length).toBe(1) // one static frame so far
    expect(ctx.arc.mock.calls.length).toBe(16) // 16 motes, one core arc each
    // The animation canvas itself never builds a radial gradient — the three
    // halo sprites are baked once each on their own throwaway canvases.
    expect(ctx.createRadialGradient.mock.calls.length).toBe(0)
    const baked = contexts.slice(1).reduce((sum, sprite) => sum + sprite.createRadialGradient.mock.calls.length, 0)
    expect(baked).toBe(3)
    // Every mote is on the near plane in the pinned stream: its halo comes
    // from the sprite, once per mote, per paint.
    expect(ctx.drawImage.mock.calls.length).toBe(16)
    unmount()
  })

  it('keeps the full desktop field unchanged', () => {
    setViewport(1280, 768)
    const { unmount } = render(<CyberBackdrop />)
    const ctx = contexts[0]
    expect(ctx.clearRect.mock.calls.length).toBe(1)
    // Full desktop density: 75 cores + 75 fresh radial halos, each drawn as
    // its own arc pair — the expensive per-frame path the mobile scene skips.
    expect(ctx.arc.mock.calls.length).toBe(150)
    // Desktop still builds a fresh radial gradient per near-plane mote…
    expect(ctx.createRadialGradient.mock.calls.length).toBe(75)
    // …and never uses the sprite path.
    expect(ctx.drawImage.mock.calls.length).toBe(0)
    unmount()
  })

  it('repaints the mobile field at ~30 fps — half the desktop cadence', () => {
    const stepMs = 1000 / 60

    setViewport(1280, 768)
    const desktop = render(<CyberBackdrop />)
    const desktopCtx = contexts[0]
    driveFrames(60, stepMs)
    const desktopPaints = desktopCtx.clearRect.mock.calls.length
    desktop.unmount()

    setViewport(390, 844)
    const mobile = render(<CyberBackdrop density="calm" />)
    const mobileCtx = contexts[contexts.length - 4] // main canvas before its 3 sprites
    driveFrames(60, stepMs)
    const mobilePaints = mobileCtx.clearRect.mock.calls.length
    mobile.unmount()

    // 60 display frames: desktop repaints every frame, mobile every second.
    expect(desktopPaints).toBe(61) // initial + 60
    expect(mobilePaints).toBe(31) // initial + 30
    // Work per 60 frames, pinned stream: desktop builds 75 radial gradients
    // on every one of its 61 repaints (4575 allocations). The mobile path
    // builds none on its animation canvas and serves all 496 halo draws
    // (16 motes × 31 frames) from the three sprites baked once up front.
    expect(desktopCtx.createRadialGradient.mock.calls.length).toBe(61 * 75)
    expect(mobileCtx.createRadialGradient.mock.calls.length).toBe(0)
    expect(mobileCtx.drawImage.mock.calls.length).toBe(16 * 31)
    const baked = contexts.slice(2).reduce((sum, sprite) => sum + sprite.createRadialGradient.mock.calls.length, 0)
    expect(baked).toBe(3)
  })

  it('yields half its cadence to a board reveal (focus mode) without restarting the field', () => {
    setViewport(390, 844)
    const { container, rerender, unmount } = render(<CyberBackdrop density="calm" />)
    const ctx = contexts[0]

    const stepMs = 1000 / 60
    // 20 display frames at normal mobile cadence: paints on every 2nd frame.
    driveFrames(20, stepMs)
    expect(ctx.clearRect.mock.calls.length).toBe(11) // initial + 10

    // The game enters reveal: the running loop halves its cadence. The clock
    // keeps running — the loop's last-paint timestamp persists across the
    // focus toggle, exactly like a real reveal in the middle of a session.
    rerender(<CyberBackdrop density="calm" focus />)
    driveFrames(20, stepMs, 20 * stepMs)
    // …and now repaints only on every 4th frame: +5 paints.
    expect(ctx.clearRect.mock.calls.length).toBe(16)

    // The field was throttled, never restarted: same canvas element, the
    // buffer was sized exactly once, and no halo sprites were re-baked.
    expect(container.querySelectorAll('canvas.cyber-particles')).toHaveLength(1)
    expect(ctx.setTransform.mock.calls.length).toBe(1)
    expect(contexts.length).toBe(4) // main canvas + 3 sprites, nothing new
    unmount()
  })
})

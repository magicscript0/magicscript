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
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
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
    // The world lives inside the camera wrapper; the viewer's atmosphere
    // (scrim, vignette) sits outside it.
    expect(backdrop?.querySelector('.cyber-scene canvas.cyber-particles')).not.toBeNull()
    expect(backdrop?.querySelector('.cyber-scene .cyber-mist')).not.toBeNull()
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
  })

  it('renders the calm density variant without crashing', () => {
    const { container } = render(<CyberBackdrop density="calm" />)
    expect(container.querySelector('.cyber-backdrop')).not.toBeNull()
  })
})

describe('CyberBackdrop quality tiers and animation path', () => {
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
   * halo cost, which is the cost the sprite path removes.
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
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
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
    // Deterministic tier inputs: a modern phone (medium tier) unless a test
    // says otherwise (the low-tier test pins a constrained device).
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true })
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true })
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

  it('builds the medium-tier mobile field: fewer motes, sprite halos, zero per-frame gradients', () => {
    // iPhone-sized viewport, a modern phone (medium tier).
    setViewport(390, 844)
    const { container, unmount } = render(<CyberBackdrop density="calm" />)
    const ctx = contexts[0]
    expect(container.querySelector('.cyber-backdrop')?.getAttribute('data-tier')).toBe('medium')
    // One deterministic medium-tier count for this viewport: the field floor
    // keeps the scene spatially alive on a small screen.
    expect(ctx.clearRect.mock.calls.length).toBe(1) // one static frame so far
    expect(ctx.arc.mock.calls.length).toBe(16) // 16 motes, one core arc each
    // The animation canvas itself never builds a radial gradient — the three
    // halo sprites plus the light-sweep sprite are baked once each on their
    // own throwaway canvases.
    expect(ctx.createRadialGradient.mock.calls.length).toBe(0)
    const baked = contexts.slice(1).reduce((sum, sprite) => sum + sprite.createRadialGradient.mock.calls.length, 0)
    expect(baked).toBe(4)
    // Every mote is on the near plane in the pinned stream: its halo comes
    // from the sprite, once per mote, per paint. The sweep has not entered
    // the field yet (its envelope starts at zero), so no sweep draw.
    expect(ctx.drawImage.mock.calls.length).toBe(16)
    unmount()
  })

  it('runs the low tier leaner — fewer motes, 20 fps, no sweep — but still animated', () => {
    // A constrained device: 2 GB RAM → low tier.
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true })
    setViewport(390, 844)
    const { container, unmount } = render(<CyberBackdrop density="full" />)
    const ctx = contexts[0]
    expect(container.querySelector('.cyber-backdrop')?.getAttribute('data-tier')).toBe('low')
    driveFrames(60, 1000 / 60)
    // 20 fps: repaints on every 3rd display frame.
    expect(ctx.clearRect.mock.calls.length).toBe(21) // initial + 20
    // 14 motes pinned to the near plane: 14 core arcs + 14 sprite halos per
    // paint — and NO light sweep on the low tier.
    expect(ctx.arc.mock.calls.length).toBe(14 * 21)
    expect(ctx.drawImage.mock.calls.length).toBe(14 * 21)
    expect(ctx.createRadialGradient.mock.calls.length).toBe(0)
    expect(contexts.length).toBe(4) // main + 3 tone sprites, no sweep sprite
    unmount()
  })

  it('keeps the full desktop (high-tier) field at native cadence', () => {
    setViewport(1280, 768)
    const { container, unmount } = render(<CyberBackdrop />)
    const ctx = contexts[0]
    expect(container.querySelector('.cyber-backdrop')?.getAttribute('data-tier')).toBe('high')
    expect(ctx.clearRect.mock.calls.length).toBe(1)
    // Full desktop density: 75 cores + 75 fresh radial halos, each drawn as
    // its own arc pair — the crisp per-frame path the mobile tiers skip.
    expect(ctx.arc.mock.calls.length).toBe(150)
    expect(ctx.createRadialGradient.mock.calls.length).toBe(75)
    // The sweep starts at zero alpha, so the first static frame is clean.
    expect(ctx.drawImage.mock.calls.length).toBe(0)
    expect(contexts.length).toBe(2) // main + sweep sprite (no tone sprites)
    unmount()
  })

  it('repaints mobile tiers at their controlled cadence; the sweep stays bounded', () => {
    const stepMs = 1000 / 60

    setViewport(1280, 768)
    const desktop = render(<CyberBackdrop />)
    const desktopCtx = contexts[0]
    driveFrames(60, stepMs)
    const desktopPaints = desktopCtx.clearRect.mock.calls.length
    desktop.unmount()

    setViewport(390, 844)
    const mobile = render(<CyberBackdrop density="calm" />)
    const mobileCtx = contexts[contexts.length - 5] // main canvas before its 4 sprites
    driveFrames(60, stepMs)
    const mobilePaints = mobileCtx.clearRect.mock.calls.length
    mobile.unmount()

    // 60 display frames: desktop repaints every frame, medium mobile every
    // second (~30 fps).
    expect(desktopPaints).toBe(61) // initial + 60
    expect(mobilePaints).toBe(31) // initial + 30
    // Work per 60 frames, pinned stream: desktop builds 75 radial gradients
    // on every one of its 61 repaints (4575 allocations). The medium path
    // builds none on its animation canvas and serves all 496 halo draws
    // (16 motes × 31 frames) from sprites baked once up front — the light
    // sweep adds at most one extra draw per paint (its sinusoidal envelope
    // is still ramping up during the first 60 frames of its 14 s cycle).
    expect(desktopCtx.createRadialGradient.mock.calls.length).toBe(61 * 75)
    expect(desktopCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(desktopCtx.drawImage.mock.calls.length).toBeLessThanOrEqual(60)
    expect(mobileCtx.createRadialGradient.mock.calls.length).toBe(0)
    expect(mobileCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(16 * 31)
    expect(mobileCtx.drawImage.mock.calls.length).toBeLessThanOrEqual(16 * 31 + 31)
    const baked = contexts.slice(2).reduce((sum, sprite) => sum + sprite.createRadialGradient.mock.calls.length, 0)
    expect(baked).toBe(4)
  })

  it('yields half its cadence to a board reveal (focus mode) — and pauses the sweep — without restarting the field', () => {
    setViewport(390, 844)
    const { container, rerender, unmount } = render(<CyberBackdrop density="calm" />)
    const ctx = contexts[0]
    const stepMs = 1000 / 60

    // 80 display frames at normal medium cadence: paints on every 2nd frame.
    // By the middle of this the light sweep has entered the field, so some
    // paints include it.
    driveFrames(80, stepMs)
    expect(ctx.clearRect.mock.calls.length).toBe(41) // initial + 40
    const preFocusPaints = 41
    const preFocusDraws = ctx.drawImage.mock.calls.length
    expect(preFocusDraws).toBeGreaterThan(16 * preFocusPaints) // sweep was active

    // The game enters reveal: the running loop halves its cadence and the
    // sweep yields entirely. The clock keeps running — the loop's
    // last-paint timestamp persists across the focus toggle, exactly like a
    // real reveal in the middle of a session.
    rerender(<CyberBackdrop density="calm" focus />)
    driveFrames(40, stepMs, 80 * stepMs)
    const focusPaints = ctx.clearRect.mock.calls.length - preFocusPaints
    expect(focusPaints).toBe(10) // 40 frames at ~15 fps
    // Every focused paint draws exactly its 16 motes — no sweep draws at all.
    expect(ctx.drawImage.mock.calls.length - preFocusDraws).toBe(16 * focusPaints)

    // The field was throttled, never restarted: same canvas element, the
    // buffer was sized exactly once, and no sprites were re-baked.
    expect(container.querySelectorAll('canvas.cyber-particles')).toHaveLength(1)
    expect(ctx.setTransform.mock.calls.length).toBe(1)
    expect(contexts.length).toBe(5) // main + 3 tone sprites + sweep sprite, nothing new
    unmount()
  })
})

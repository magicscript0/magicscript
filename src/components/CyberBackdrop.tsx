import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../utils/random'

export interface CyberBackdropProps {
  /**
   * Particle ambience level. Every public screen uses the full field; the
   * game's reveal still gets its own budget (see `focus`).
   */
  density?: 'full' | 'calm'
  /**
   * Frame-budget guard for the Apple reveal. While the board is revealing,
   * the mobile particle field drops its cadence (30 → 15 fps, or 20 → 10
   * fps on the low tier) and the light sweep pauses, so the reveal keeps
   * the frame budget. The field keeps moving — it only repaints less often
   * — and returns to full cost when the reveal ends. This is a ref read by
   * the running loop, so toggling it never restarts the field, resizes the
   * canvas, or regenerates particles (no visible pop, no background reset).
   */
  focus?: boolean
}

type QualityTier = 'high' | 'medium' | 'low'

interface Particle {
  x: number
  y: number
  radius: number
  drift: number
  sway: number
  swaySpeed: number
  phase: number
  twinkleSpeed: number
  alpha: number
  /** 0 = emerald, 1 = ice white, 2 = signal red (rare accent). */
  tone: 0 | 1 | 2
  /**
   * Distance from the viewer, 0 (far) → 1 (near). Drives size, brightness,
   * speed and halo cost, so the field reads as three depth planes instead
   * of one flat sprinkling.
   */
  depth: number
}

const TONE_COLORS = ['70,227,161', '190,242,255', '251,113,133'] as const

/** Viewport width at and below which the canvas runs its mobile animation
 * path. Matches the CSS `max-width: 639px` breakpoint so the 3D scene and
 * the particle field scale down together. */
const MOBILE_BREAKPOINT = 640
/** Medium tier (modern phones): ~30 fps — continuous life, half the wakeups. */
const MEDIUM_FRAME_MS = 1000 / 30
/** During the board reveal the medium field yields the budget: ~15 fps. */
const MEDIUM_FOCUS_FRAME_MS = 1000 / 15
/** Low tier (very constrained phones): ~20 fps. */
const LOW_FRAME_MS = 1000 / 20
/** During the board reveal the low field yields the budget: ~10 fps. */
const LOW_FOCUS_FRAME_MS = 1000 / 10
/** Halos are pre-baked into one sprite per tone instead of per-frame gradients. */
const SPRITE_SIZE = 48
const SWEEP_SPRITE_SIZE = 256
/** One full crossing of the cinematic light sweep. */
const SWEEP_PERIOD_MS = 14000
/** Peak alpha of the sweep — a pass of light, never a flash. */
const SWEEP_PEAK_ALPHA = 0.075

/**
 * Quality tier for the canvas field:
 *  · high   — desktop / powerful devices: full counts, crisp per-frame
 *             halos, native rAF cadence;
 *  · medium — modern phones: sprite halos, ~30 fps (15 while revealing);
 *  · low    — very constrained phones: fewer motes, ~20 fps (10 while
 *             revealing), no sweep — but the scene stays visibly moving.
 * Unknown capability signals (private-browsing, non-Chrome `deviceMemory`)
 * are treated as modern rather than constrained. The tier is published on
 * the backdrop root (`data-tier`) so the CSS scene can shed its added
 * depth planes on low-tier devices too.
 */
function detectTier(width: number): QualityTier {
  if (width >= MOBILE_BREAKPOINT) return 'high'
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8
  const saveData = nav.connection?.saveData === true
  return saveData || memory <= 3 || cores <= 3 ? 'low' : 'medium'
}

function createParticles(count: number, width: number, height: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i += 1) {
    const roll = Math.random()
    // Depth is deliberately skewed towards the far plane: lots of faint dust
    // behind a few bright motes is what gives the field its sense of space.
    const depth = Math.pow(Math.random(), 1.7)
    const band = depth < 0.42 ? 0 : depth < 0.78 ? 1 : 2
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      // The near plane gets the only big, bright motes — size *and* speed
      // both track depth, which is what reads as parallax.
      radius: band === 2 ? 0.5 + depth * 2.6 : 0.3 + depth * 1.5,
      drift: 0.03 + depth * 0.34,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.002 + Math.random() * 0.008,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.008 + Math.random() * 0.03,
      alpha: band === 0 ? 0.06 + depth * 0.22 : 0.09 + depth * 0.55,
      tone: roll < 0.72 ? 0 : roll < 0.93 ? 1 : 2,
      depth,
    })
  }
  return particles
}

/**
 * One radial sprite per tone: the near-plane halo (core glow + soft falloff)
 * baked once, so the mobile frame loop never builds a gradient per particle.
 * Drawn with a per-particle `globalAlpha` to keep the twinkle live.
 */
function bakeHaloSprite(color: string): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas')
  sprite.width = SPRITE_SIZE
  sprite.height = SPRITE_SIZE
  const sctx = sprite.getContext('2d')
  if (!sctx) return null
  const half = SPRITE_SIZE / 2
  const halo = sctx.createRadialGradient(half, half, 0, half, half, half)
  halo.addColorStop(0, `rgba(${color},1)`)
  halo.addColorStop(0.55, `rgba(${color},0.32)`)
  halo.addColorStop(1, `rgba(${color},0)`)
  sctx.fillStyle = halo
  sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return sprite
}

/**
 * The cinematic light sweep: one big, very soft ice glow, baked once and
 * traversing the field diagonally every SWEEP_PERIOD_MS at a peak alpha of
 * 7.5 % — an atmosphere pass, not an effect. Skipped entirely while the
 * board is revealing (focus) and on the low tier.
 */
function bakeSweepSprite(): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas')
  sprite.width = SWEEP_SPRITE_SIZE
  sprite.height = SWEEP_SPRITE_SIZE
  const sctx = sprite.getContext('2d')
  if (!sctx) return null
  const half = SWEEP_SPRITE_SIZE / 2
  const halo = sctx.createRadialGradient(half, half, 0, half, half, half)
  halo.addColorStop(0, 'rgba(150, 235, 255, .5)')
  halo.addColorStop(0.45, 'rgba(110, 220, 240, .14)')
  halo.addColorStop(1, 'rgba(110, 220, 240, 0)')
  sctx.fillStyle = halo
  sctx.fillRect(0, 0, SWEEP_SPRITE_SIZE, SWEEP_SPRITE_SIZE)
  return sprite
}

/** Desktop (high) frame: crisp core arcs + a fresh radial halo on the near plane. */
function paintFrame(ctx: CanvasRenderingContext2D, particles: Particle[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  for (const particle of particles) {
    const twinkle = 0.55 + 0.45 * Math.sin(particle.phase)
    const color = TONE_COLORS[particle.tone]
    const alpha = particle.alpha * twinkle
    // Soft halo — reserved for the near plane, where it is actually visible.
    // Far dust is a single cheap arc.
    if (particle.depth > 0.55) {
      const halo = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.radius * 4)
      halo.addColorStop(0, `rgba(${color},${(alpha * 0.5).toFixed(3)})`)
      halo.addColorStop(1, `rgba(${color},0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // Bright core.
    ctx.fillStyle = `rgba(${color},${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * Mobile (medium/low) frame: the same visual recipe (additive near-plane
 * halo + core) but the halo is a pre-baked sprite, so a full repaint is a
 * handful of `drawImage`/`arc` calls with no per-frame gradient allocation.
 */
function paintFrameMobile(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  sprites: (HTMLCanvasElement | null)[],
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  for (const particle of particles) {
    const twinkle = 0.55 + 0.45 * Math.sin(particle.phase)
    const color = TONE_COLORS[particle.tone]
    const alpha = particle.alpha * twinkle
    const sprite = sprites[particle.tone]
    if (particle.depth > 0.55 && sprite) {
      const size = particle.radius * 8
      ctx.globalAlpha = alpha * 0.5
      ctx.drawImage(sprite, particle.x - size / 2, particle.y - size / 2, size, size)
    }
    ctx.globalAlpha = alpha
    ctx.fillStyle = `rgba(${color},1)`
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * Premium "cyber command" ambience for the PUBLIC game experience only
 * (login + play). Fixed, non-interactive, and strictly decorative.
 *
 * The scene is one world in three depth languages, shared by the boot
 * screen, the login and the game — which is what makes the three screens
 * read as one place:
 *  · a slow camera orbit (`.cyber-scene`) carrying every world layer;
 *  · far atmosphere (mist band, far floor grid, two distant rings);
 *  · near world (floor grid, horizon, light shafts, red counter-glow,
 *    the closest ring);
 *  · the particle field: three canvas depth planes with depth-scaled size,
 *    speed and brightness, plus the occasional light sweep.
 * The viewer's own atmosphere (scanlines, depth scrim, vignette) stays
 * outside the camera wrapper.
 *
 * Quality tiers: high (desktop) runs the full field at native rAF; medium
 * (modern phones) runs sprite halos at ~30 fps; low (constrained phones)
 * runs a leaner field at ~20 fps. Every tier stays visibly animated.
 *
 * `focus` (set by the game while the Apple reveal is running) drops the
 * mobile cadence to half and pauses the sweep — the field keeps moving at
 * reduced cost, then restores. It is a ref read by the running loop, so it
 * never restarts the field.
 *
 * The canvas is a persistent instance: React state changes (density, focus)
 * never remount it; only viewport resizes re-size the buffer. Both paths
 * pause when the tab is hidden, and `prefers-reduced-motion` renders a
 * single static frame with no animation loop.
 */
export function CyberBackdrop({ density = 'full', focus = false }: CyberBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Read by the running loop — the focus state must never re-run the canvas
  // effect (that would resize the buffer and regenerate the whole field).
  const focusRef = useRef(focus)

  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (typeof window === 'undefined') return

    let particles: Particle[] = []
    let sprites: (HTMLCanvasElement | null)[] = []
    let sweepSprite: HTMLCanvasElement | null = null
    let width = 0
    let height = 0
    let frameId: number | null = null
    let running = true
    let disposed = false
    let tier: QualityTier = 'high'
    let lastPaint = 0
    let lastTick = 0
    let sweepT = 0

    const paintSweep = () => {
      if (!sweepSprite) return
      const t = sweepT / SWEEP_PERIOD_MS
      // Sinusoidal envelope: the light enters and leaves at zero alpha, so
      // the 14 s cycle wraps without a visible pop.
      const alpha = Math.sin(t * Math.PI) * SWEEP_PEAK_ALPHA
      // Reveal budget: the sweep is the first atmospheric effect to yield.
      if (alpha <= 0.004 || focusRef.current) return
      const size = Math.max(width, height) * 0.95
      const x = -size * 0.4 + t * (width + size * 0.8)
      const y = height * (0.72 - 0.5 * t)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = alpha
      ctx.drawImage(sweepSprite, x - size / 2, y - size / 2, size, size)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const paintNow = () => {
      if (tier === 'high') paintFrame(ctx, particles, width, height)
      else paintFrameMobile(ctx, particles, sprites, width, height)
      paintSweep()
    }

    const resize = () => {
      const cssWidth = canvas.clientWidth || window.innerWidth
      const cssHeight = canvas.clientHeight || window.innerHeight
      if (cssWidth <= 0 || cssHeight <= 0) return
      width = cssWidth
      height = cssHeight
      tier = detectTier(cssWidth)
      // The CSS scene reads the tier off the backdrop root (depth-plane
      // shedding on the low tier) — an attribute write, no React re-render.
      rootRef.current?.setAttribute('data-tier', tier)
      // High-ppi phones do not need desktop DPR for faint dust.
      const dpr = Math.min(
        typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
        tier === 'high' ? 1.5 : tier === 'medium' ? 1.25 : 1,
      )
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = cssWidth * cssHeight
      let count: number
      if (tier === 'high') {
        const base = density === 'full' ? Math.floor(area / 13000) : Math.floor(area / 21000)
        const cap = density === 'full' ? 120 : 60
        count = Math.max(14, Math.min(cap, base))
      } else if (tier === 'medium') {
        // Still three depth planes, far fewer motes — with a floor high
        // enough that the scene keeps its sense of space on a small screen.
        const base = density === 'full' ? Math.floor(area / 15000) : Math.floor(area / 24000)
        const cap = density === 'full' ? 40 : 28
        count = Math.max(density === 'full' ? 20 : 16, Math.min(cap, base))
      } else {
        // The low tier trades density for headroom — the field is smaller,
        // never empty.
        count = density === 'full' ? 14 : 10
      }
      if (tier !== 'high' && sprites.length === 0) {
        sprites = TONE_COLORS.map((color) => bakeHaloSprite(color))
      }
      if (tier !== 'low' && !sweepSprite) {
        sweepSprite = bakeSweepSprite()
      }
      particles = createParticles(count, width, height)
      paintNow()
    }

    const tick = () => {
      if (!running || disposed) return
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      // Tier throttling: high runs at native rAF; medium ~30 fps; low ~20.
      // Reveal focus halves the mobile cadences. The loop keeps waking with
      // the display (no beat-frequency flicker) and only skips the paint.
      if (tier !== 'high') {
        const idleMs = tier === 'medium' ? MEDIUM_FRAME_MS : LOW_FRAME_MS
        const minMs = focusRef.current ? (tier === 'medium' ? MEDIUM_FOCUS_FRAME_MS : LOW_FOCUS_FRAME_MS) : idleMs
        if (now - lastPaint < minMs - 1) {
          frameId = window.requestAnimationFrame(tick)
          return
        }
        lastPaint = now
      }
      // Sweep clock — dt clamped so a backgrounded tab cannot teleport the
      // light to the middle of its path on resume.
      const dt = lastTick === 0 ? 0 : Math.min(now - lastTick, 250)
      lastTick = now
      sweepT = (sweepT + dt) % SWEEP_PERIOD_MS
      for (const particle of particles) {
        particle.y -= particle.drift
        particle.sway += particle.swaySpeed
        particle.x += Math.sin(particle.sway) * 0.12
        particle.phase += particle.twinkleSpeed
        if (particle.y < -8) {
          particle.y = height + 8
          particle.x = Math.random() * width
        }
      }
      paintNow()
      frameId = window.requestAnimationFrame(tick)
    }

    const onVisibility = () => {
      const visible = document.visibilityState !== 'hidden'
      if (visible && running && frameId === null && !prefersReducedMotion()) {
        frameId = window.requestAnimationFrame(tick)
      } else if (!visible && frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
    }

    let resizeTimer: number | null = null
    const onResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(resize, 150)
    }

    resize()
    if (!prefersReducedMotion() && typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      running = false
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
    }
  }, [density])

  return (
    <div ref={rootRef} aria-hidden="true" className="cyber-backdrop">
      {/* The world — everything that lives in the space, on one slow orbit. */}
      <div className="cyber-scene">
        <div className="cyber-base" />
        <div className="cyber-mist" />
        <div className="cyber-glow cyber-glow--green" />
        <div className="cyber-glow cyber-glow--red" />
        <div className="cyber-ring cyber-ring--a" />
        <div className="cyber-ring cyber-ring--b" />
        <div className="cyber-ring cyber-ring--c" />
        <div className="cyber-shafts" />
        <canvas ref={canvasRef} className="cyber-particles" />
        <div className="cyber-grid-floor">
          <span className="cyber-grid-plane cyber-grid-plane--far" />
          <span className="cyber-grid-plane" />
        </div>
        <div className="cyber-horizon" />
      </div>
      {/* The viewer's own atmosphere — stays put while the world moves. */}
      <div className="cyber-scanlines" />
      <div className="cyber-depth" />
      <div className="cyber-vignette" />
    </div>
  )
}

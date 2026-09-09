import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../utils/random'

export interface CyberBackdropProps {
  /**
   * Particle ambience level. The login screen uses the full field; the game
   * board uses a calmer field so the prediction grid stays the focal point.
   */
  density?: 'full' | 'calm'
}

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
   * Distance from the viewer, 0 (far) → 1 (near). Drives size, brightness and
   * speed, so the field reads as three depth planes instead of one flat
   * sprinkling — and only the near plane pays for its halo.
   */
  depth: number
}

const TONE_COLORS = ['70,227,161', '190,242,255', '251,113,133'] as const

/**
 * Viewport width at and below which the canvas runs its mobile animation
 * path. Matches the CSS `max-width: 639px` breakpoint so the 3D scene and
 * the particle field scale down together.
 */
const MOBILE_BREAKPOINT = 640
/** The mobile field repaints at ~30 fps — continuous life, half the wakeups. */
const MOBILE_FRAME_MS = 1000 / 30
/** Halos are pre-baked into one sprite per tone instead of per-frame gradients. */
const SPRITE_SIZE = 48

function createParticles(count: number, width: number, height: number, mobile: boolean): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i += 1) {
    const roll = Math.random()
    // Depth is deliberately skewed towards the far plane: lots of faint dust
    // behind a few bright motes is what gives the field its sense of space.
    const depth = Math.pow(Math.random(), 1.7)
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.35 + depth * 1.75,
      // Mobile keeps the depth-scaled parallax (near dust still outruns far
      // dust) but with reduced movement amplitude.
      drift: (0.035 + depth * 0.3) * (mobile ? 0.75 : 1),
      sway: Math.random() * Math.PI * 2,
      swaySpeed: (0.002 + Math.random() * 0.008) * (mobile ? 0.7 : 1),
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.008 + Math.random() * 0.03,
      alpha: 0.1 + depth * 0.5,
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

/** Desktop frame: crisp core arcs + a fresh radial halo on the near plane. */
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
 * Mobile frame: the same visual recipe (additive near-plane halo + core) but
 * the halo is a pre-baked sprite, so a full repaint is a handful of
 * `drawImage`/`arc` calls with no per-frame gradient allocation.
 */
function paintFrameMobile(ctx: CanvasRenderingContext2D, particles: Particle[], sprites: (HTMLCanvasElement | null)[], width: number, height: number) {
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
 * Layers (back to front): deep gradient → ambient neon glows → faint
 * geometric rings → volumetric light shafts → drifting particle field with
 * three depth planes (canvas) → perspective grid floor → horizon light →
 * restrained scanlines → depth scrim → vignette. The center stays dark and
 * calm so the forms and the prediction board keep full contrast.
 *
 * Shared by the boot screen, the login and the game — which is what makes the
 * three screens read as one place. Everything here is `aria-hidden`,
 * non-interactive, and animated with transform/opacity only.
 *
 * Two animation paths share one visual identity:
 *  · desktop — full field, crisp per-frame halos, native rAF cadence;
 *  · mobile (≤ 639 px) — the same scene on a light budget: ~30 fps repaints,
 *    pre-baked halo sprites instead of per-frame gradients, fewer motes,
 *    reduced drift/sway amplitude and a lower DPR cap. The 3D CSS layers get
 *    their own mobile tuning in index.css.
 *
 * Both paths pause when the tab is hidden, and `prefers-reduced-motion`
 * renders a single static frame with no animation loop.
 */
export function CyberBackdrop({ density = 'full' }: CyberBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (typeof window === 'undefined') return

    let particles: Particle[] = []
    let sprites: (HTMLCanvasElement | null)[] = []
    let width = 0
    let height = 0
    let frameId: number | null = null
    let running = true
    let disposed = false
    let mobile = false
    let lastPaint = 0

    const paintNow = () => {
      if (mobile) paintFrameMobile(ctx, particles, sprites, width, height)
      else paintFrame(ctx, particles, width, height)
    }

    const resize = () => {
      const cssWidth = canvas.clientWidth || window.innerWidth
      const cssHeight = canvas.clientHeight || window.innerHeight
      if (cssWidth <= 0 || cssHeight <= 0) return
      width = cssWidth
      height = cssHeight
      mobile = cssWidth < MOBILE_BREAKPOINT
      // High-ppi phones do not need desktop DPR for faint dust.
      const dpr = Math.min(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, mobile ? 1.25 : 1.5)
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = cssWidth * cssHeight
      let count: number
      if (mobile) {
        // Lighter field: still three depth planes, far fewer motes — and a
        // floor high enough that the scene keeps its sense of space on a
        // small screen instead of flattening into a handful of dots.
        const base = density === 'full' ? Math.floor(area / 15000) : Math.floor(area / 24000)
        const cap = density === 'full' ? 40 : 28
        count = Math.max(density === 'full' ? 20 : 16, Math.min(cap, base))
      } else {
        const base = density === 'full' ? Math.floor(area / 13000) : Math.floor(area / 21000)
        const cap = density === 'full' ? 120 : 60
        count = Math.max(14, Math.min(cap, base))
      }
      if (mobile && sprites.length === 0) {
        sprites = TONE_COLORS.map((color) => bakeHaloSprite(color))
      }
      particles = createParticles(count, width, height, mobile)
      paintNow()
    }

    const tick = () => {
      if (!running || disposed) return
      // Mobile: repaint at ~30 fps. The loop keeps waking with the display
      // (no beat-frequency flicker) but does field work on every second
      // callback — half the JS and GPU upload of the desktop path.
      if (mobile) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (now - lastPaint < MOBILE_FRAME_MS - 1) {
          frameId = window.requestAnimationFrame(tick)
          return
        }
        lastPaint = now
      }
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
    <div aria-hidden="true" className="cyber-backdrop">
      <div className="cyber-base" />
      <div className="cyber-glow cyber-glow--green" />
      <div className="cyber-glow cyber-glow--red" />
      <div className="cyber-ring cyber-ring--a" />
      <div className="cyber-ring cyber-ring--b" />
      <div className="cyber-shafts" />
      <canvas ref={canvasRef} className="cyber-particles" />
      <div className="cyber-grid-floor">
        <span className="cyber-grid-plane" />
      </div>
      <div className="cyber-horizon" />
      <div className="cyber-scanlines" />
      <div className="cyber-depth" />
      <div className="cyber-vignette" />
    </div>
  )
}

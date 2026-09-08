import { memo, useEffect, useRef } from 'react'
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
 * Devices that get the light rendering path: phones, tablets and anything
 * driven by a touch pointer. Mirrors the compact rendering tier in index.css
 * so the CSS and the canvas always agree about which machine they are on.
 */
const COMPACT_QUERY = '(max-width: 1023px), (pointer: coarse)'
/** The drift/sway/twinkle rates below are authored per 60Hz frame. */
const FRAME_MS = 1000 / 60
/** Ambient dust does not need a frame per vsync — halving the cadence halves
 * the only continuously repainted surface in the app. */
const COMPACT_FRAME_BUDGET_MS = 1000 / 30
const FULL_FRAME_BUDGET_MS = 1000 / 60
/** Longest step the simulation will take after a stall or a throttled tab. */
const MAX_STEP_MS = 64

const HALO_SIZE = 64
const CORE_SIZE = 16

interface Sprites {
  readonly halo: readonly HTMLCanvasElement[]
  readonly core: readonly HTMLCanvasElement[]
}

/**
 * Bakes one soft halo and one tight core stamp per tone, once per mount.
 *
 * The field used to build a fresh `createRadialGradient` for every near
 * particle on every frame — an allocation plus a shader-backed blur per
 * particle per frame, on a full-viewport canvas. Both stamps are drawn with a
 * single `drawImage` instead, which is the difference between the particle
 * layer being the most expensive thing on screen and being nearly free.
 */
function bakeSprites(): Sprites | null {
  if (typeof document === 'undefined') return null
  const halo: HTMLCanvasElement[] = []
  const core: HTMLCanvasElement[] = []

  for (const color of TONE_COLORS) {
    const haloCanvas = document.createElement('canvas')
    haloCanvas.width = HALO_SIZE
    haloCanvas.height = HALO_SIZE
    const haloCtx = haloCanvas.getContext('2d')
    if (!haloCtx) return null
    const haloRadius = HALO_SIZE / 2
    const haloGradient = haloCtx.createRadialGradient(haloRadius, haloRadius, 0, haloRadius, haloRadius, haloRadius)
    haloGradient.addColorStop(0, `rgba(${color},.5)`)
    haloGradient.addColorStop(0.16, `rgba(${color},.32)`)
    haloGradient.addColorStop(0.42, `rgba(${color},.11)`)
    haloGradient.addColorStop(1, `rgba(${color},0)`)
    haloCtx.fillStyle = haloGradient
    haloCtx.fillRect(0, 0, HALO_SIZE, HALO_SIZE)
    halo.push(haloCanvas)

    const coreCanvas = document.createElement('canvas')
    coreCanvas.width = CORE_SIZE
    coreCanvas.height = CORE_SIZE
    const coreCtx = coreCanvas.getContext('2d')
    if (!coreCtx) return null
    const coreRadius = CORE_SIZE / 2
    const coreGradient = coreCtx.createRadialGradient(coreRadius, coreRadius, 0, coreRadius, coreRadius, coreRadius)
    coreGradient.addColorStop(0, `rgba(${color},1)`)
    coreGradient.addColorStop(0.5, `rgba(${color},.78)`)
    coreGradient.addColorStop(1, `rgba(${color},0)`)
    coreCtx.fillStyle = coreGradient
    coreCtx.fillRect(0, 0, CORE_SIZE, CORE_SIZE)
    core.push(coreCanvas)
  }

  return { halo, core }
}

function createParticles(count: number, width: number, height: number): Particle[] {
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
      drift: 0.035 + depth * 0.3,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.002 + Math.random() * 0.008,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.008 + Math.random() * 0.03,
      alpha: 0.1 + depth * 0.5,
      tone: roll < 0.72 ? 0 : roll < 0.93 ? 1 : 2,
      depth,
    })
  }
  return particles
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  sprites: Sprites,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  for (const particle of particles) {
    const twinkle = 0.55 + 0.45 * Math.sin(particle.phase)
    ctx.globalAlpha = particle.alpha * twinkle
    // Soft halo — reserved for the near plane, where it is actually visible.
    // Far dust is a single cheap stamp.
    if (particle.depth > 0.55) {
      const haloRadius = particle.radius * 4
      ctx.drawImage(sprites.halo[particle.tone], particle.x - haloRadius, particle.y - haloRadius, haloRadius * 2, haloRadius * 2)
    }
    const coreRadius = particle.radius * 1.55
    ctx.drawImage(sprites.core[particle.tone], particle.x - coreRadius, particle.y - coreRadius, coreRadius * 2, coreRadius * 2)
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
 * Performance + accessibility: pre-baked particle stamps, a resolution tier
 * that follows the device instead of the display, frame-rate-independent
 * motion (so a 120Hz panel does not run the field twice as fast), a capped
 * DPR, a throttled cadence on compact devices, the loop pauses when the tab is
 * hidden, and `prefers-reduced-motion` renders a single static frame with no
 * animation loop at all.
 *
 * Memoized: the ambient field is mounted by three different screens and must
 * never be re-rendered (let alone restarted) by an unrelated state change such
 * as the access countdown.
 */
export const CyberBackdrop = memo(function CyberBackdrop({ density = 'full' }: CyberBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (typeof window === 'undefined') return

    const compact = typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY).matches : false
    // A phone backs this canvas with 3 device pixels per CSS pixel. Nothing in
    // a field of soft, glowing motes can resolve that, so the compact tier
    // rasterizes at 1× and lets the compositor upscale — which removes about
    // two thirds of the pixels cleared, filled and uploaded every frame.
    const rawDpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1
    const dpr = Math.min(rawDpr, compact ? 1 : 1.5)
    const frameBudget = compact ? COMPACT_FRAME_BUDGET_MS : FULL_FRAME_BUDGET_MS

    const sprites = bakeSprites()
    if (!sprites) return

    let particles: Particle[] = []
    let width = 0
    let height = 0
    let frameId: number | null = null
    let lastFrameAt = 0
    let running = true
    let disposed = false

    const resize = () => {
      const cssWidth = canvas.clientWidth || window.innerWidth
      const cssHeight = canvas.clientHeight || window.innerHeight
      if (cssWidth <= 0 || cssHeight <= 0) return
      width = cssWidth
      height = cssHeight
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = cssWidth * cssHeight
      const base = density === 'full' ? Math.floor(area / 13000) : Math.floor(area / 21000)
      const cap = density === 'full' ? 120 : 60
      const smallScreen = cssWidth < 640
      const count = Math.max(14, Math.min(cap, smallScreen ? Math.floor(base / 2) : base))
      particles = createParticles(count, width, height)
      paintFrame(ctx, particles, sprites, width, height)
    }

    const tick = (now: number) => {
      if (!running || disposed) return
      frameId = window.requestAnimationFrame(tick)
      const elapsed = lastFrameAt === 0 ? FRAME_MS : now - lastFrameAt
      // Throttle: hold this vsync, keep the accumulated time, and step the
      // simulation by however long actually passed. The field drifts at the
      // same speed at 30, 60, 90 or 120Hz.
      if (elapsed < frameBudget) return
      lastFrameAt = now
      const step = Math.min(MAX_STEP_MS, elapsed) / FRAME_MS
      for (const particle of particles) {
        particle.y -= particle.drift * step
        particle.sway += particle.swaySpeed * step
        particle.x += Math.sin(particle.sway) * 0.12 * step
        particle.phase += particle.twinkleSpeed * step
        if (particle.y < -8) {
          particle.y = height + 8
          particle.x = Math.random() * width
        }
      }
      paintFrame(ctx, particles, sprites, width, height)
    }

    const onVisibility = () => {
      const visible = document.visibilityState !== 'hidden'
      if (visible && running && frameId === null && !prefersReducedMotion()) {
        lastFrameAt = 0
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
})

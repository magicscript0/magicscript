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
}

const TONE_COLORS = ['70,227,161', '190,242,255', '251,113,133'] as const

function createParticles(count: number, width: number, height: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i += 1) {
    const roll = Math.random()
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.6 + Math.random() * 1.6,
      drift: 0.08 + Math.random() * 0.28,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.002 + Math.random() * 0.008,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.008 + Math.random() * 0.03,
      alpha: 0.25 + Math.random() * 0.55,
      tone: roll < 0.72 ? 0 : roll < 0.93 ? 1 : 2,
    })
  }
  return particles
}

function paintFrame(ctx: CanvasRenderingContext2D, particles: Particle[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  for (const particle of particles) {
    const twinkle = 0.55 + 0.45 * Math.sin(particle.phase)
    const color = TONE_COLORS[particle.tone]
    const alpha = particle.alpha * twinkle
    // Soft halo (cheap radial feel without shadowBlur).
    const halo = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.radius * 4)
    halo.addColorStop(0, `rgba(${color},${(alpha * 0.5).toFixed(3)})`)
    halo.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2)
    ctx.fill()
    // Bright core.
    ctx.fillStyle = `rgba(${color},${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * Premium "cyber command" ambience for the PUBLIC game experience only
 * (login + play). Fixed, non-interactive, and strictly decorative.
 *
 * Layers (back to front): deep gradient → ambient neon glows → faint
 * geometric rings → drifting particle field (canvas) → perspective grid
 * floor → scanlines → vignette. The center stays dark and calm so forms
 * and the prediction board keep full contrast.
 *
 * Performance + accessibility: capped DPR, width-based particle counts,
 * the loop pauses when the tab is hidden, and `prefers-reduced-motion`
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

    const dpr = Math.min(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1.5)
    let particles: Particle[] = []
    let width = 0
    let height = 0
    let frameId: number | null = null
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
      const base = density === 'full' ? Math.floor(area / 16000) : Math.floor(area / 26000)
      const cap = density === 'full' ? 90 : 45
      const smallScreen = cssWidth < 640
      const count = Math.max(12, Math.min(cap, smallScreen ? Math.floor(base / 2) : base))
      particles = createParticles(count, width, height)
      paintFrame(ctx, particles, width, height)
    }

    const tick = () => {
      if (!running || disposed) return
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
      paintFrame(ctx, particles, width, height)
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
      <canvas ref={canvasRef} className="cyber-particles" />
      <div className="cyber-grid-floor" />
      <div className="cyber-scanlines" />
      <div className="cyber-vignette" />
    </div>
  )
}

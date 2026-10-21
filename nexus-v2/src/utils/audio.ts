// Procedural Web Audio API Sound Synthesizer (Zero asset dependencies, AAA sci-fi sound design)
let audioCtx: AudioContext | null = null
let soundEnabled = true

function getAudioContext(): AudioContext | null {
  if (!soundEnabled) return null
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        audioCtx = new AudioContextClass()
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

export function toggleAudio(enabled?: boolean): boolean {
  soundEnabled = enabled !== undefined ? enabled : !soundEnabled
  return soundEnabled
}

export function isAudioEnabled(): boolean {
  return soundEnabled
}

/** Soft cyber telemetry blip */
export function playTelemetryBlip(freq = 880, duration = 0.04) {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration)

    gain.gain.setValueAtTime(0.03, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

/** Tactile button click / laser pulse */
export function playLaserClick() {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.08)

    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  } catch {}
}

/** Triumphant cyber chord on Nova Flash / Successful Login */
export function playCyberNovaChime() {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const freqs = [330, 440, 660, 880]
    freqs.forEach((freq, i) => {
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.04)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.33, ctx.currentTime + 0.6)

      gain.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime + i * 0.04)
      osc.stop(ctx.currentTime + 0.6)
    })
  } catch {}
}

/** Cyber shockwave boom on click */
export function playShockwavePulse() {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.25)

    gain.gain.setValueAtTime(0.07, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

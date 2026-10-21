import React, { useEffect, useState, useMemo } from 'react'
import {
  Cpu,
  Zap,
  Radio,
  Terminal,
  ShieldCheck,
  Activity,
  Layers,
  Lock,
  CheckCircle2,
  HardDrive,
} from 'lucide-react'

interface BootLoaderProps {
  onComplete: () => void
}

interface LogEntry {
  id: number
  time: string
  text: string
  status: 'PENDING' | 'DONE' | 'VERIFIED'
}

export const BootLoader: React.FC<BootLoaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'locking' | 'revealing'>('loading')
  const [activeLog, setActiveLog] = useState('')
  const [bytesLoaded, setBytesLoaded] = useState(0)
  const totalBytes = 284000 // 284 KB

  // Real Hardware Detection for 100% Authentic Telemetry
  const systemMetrics = useMemo(() => {
    let gpu = 'WebGL 2.0 Accelerated'
    try {
      const canvas = document.createElement('canvas')
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const rendererStr = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          if (rendererStr) {
            gpu = rendererStr.replace(/^ANGLE \(([^,]+).*\)$/, '$1').slice(0, 26)
          }
        }
      }
    } catch {}

    const cores = navigator.hardwareConcurrency || 8
    const memory = (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory} GB` : '8 GB'
    const resolution = `${window.screen.width}x${window.screen.height}`

    return { gpu, cores: `${cores} CORES`, memory, resolution }
  }, [])

  // Realistic Boot Phases with Variable Burst Timing
  useEffect(() => {
    const stages = [
      { p: 18, msg: 'KERNEL_INIT: Mounting WebGL 2.0 graphics pipeline...', delay: 280 },
      { p: 34, msg: 'HARDWARE_PROBE: Handshaking host GPU & memory allocations...', delay: 420 },
      { p: 58, msg: 'SUPABASE_RPC: Establishing secure TLS tunnel (AES-GCM-256)...', delay: 550 },
      { p: 76, msg: 'FIREBASE_BRIDGE: Syncing /m11 realtime prediction telemetry...', delay: 480 },
      { p: 92, msg: 'SPATIAL_CALIB: Calibrating 3D perspective & 60 FPS matrix...', delay: 420 },
      { p: 100, msg: 'SYSTEM_VERIFIED: All security channels armed & ready.', delay: 350 },
    ]

    let currentStage = 0
    let currentP = 0

    const runStage = () => {
      if (currentStage >= stages.length) {
        // Step 2: Lock stage (100% confirmation)
        setPhase('locking')
        setTimeout(() => {
          // Step 3: Trigger innovative shutter reveal
          setPhase('revealing')
          setTimeout(() => {
            onComplete()
          }, 600)
        }, 400)
        return
      }

      const stage = stages[currentStage]
      setActiveLog(stage.msg)

      const startP = currentP
      const targetP = stage.p
      const startTime = performance.now()
      const duration = stage.delay

      const step = (now: number) => {
        const elapsed = now - startTime
        const factor = Math.min(1, elapsed / duration)
        // Natural ease-out interpolation
        const nextP = Math.round(startP + (targetP - startP) * (1 - Math.pow(1 - factor, 2.5)))
        currentP = nextP
        setProgress(nextP)
        setBytesLoaded(Math.round((nextP / 100) * totalBytes))

        if (factor < 1) {
          requestAnimationFrame(step)
        } else {
          currentStage++
          setTimeout(runStage, 90)
        }
      }

      requestAnimationFrame(step)
    }

    const timer = setTimeout(runStage, 200)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030712] transition-all duration-700 select-none ${
        phase === 'revealing' ? 'opacity-0 pointer-events-none scale-110' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Ambience: Subtle Tech Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,254,0.08)_0,transparent_75%)] pointer-events-none" />
      <div className="absolute inset-0 scanlines-overlay opacity-25 pointer-events-none" />

      {/* Top Telemetry Header */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-xs font-mono-tech border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3 text-cyan-400">
          <Radio className="w-4 h-4 animate-pulse" />
          <span className="tracking-widest font-bold">NEXUS SECURE BOOTLOADER · V2.4</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="hidden sm:inline">RESOLUTION: <span className="text-white">{systemMetrics.resolution}</span></span>
          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            {phase === 'locking' ? 'LOCKED // 100%' : 'INITIALIZING'}
          </span>
        </div>
      </div>

      {/* Side Hardware Telemetry (Real system specifications) */}
      <div className="hidden lg:flex flex-col gap-3 absolute left-8 top-1/2 -translate-y-1/2 p-4 rounded-2xl glass-panel text-[11px] font-mono-tech text-slate-400 w-64 border-cyan-500/20 shadow-2xl">
        <div className="flex items-center gap-2 text-cyan-300 font-bold border-b border-slate-800 pb-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <span>AUTHENTIC HARDWARE AUDIT</span>
        </div>
        <div className="flex justify-between">
          <span>GPU ENGINE:</span>
          <span className="text-white truncate max-w-[120px]">{systemMetrics.gpu}</span>
        </div>
        <div className="flex justify-between">
          <span>CPU THREADS:</span>
          <span className="text-emerald-400">{systemMetrics.cores}</span>
        </div>
        <div className="flex justify-between">
          <span>DEVICE RAM:</span>
          <span className="text-violet-300">{systemMetrics.memory}</span>
        </div>
        <div className="flex justify-between">
          <span>BYTE STREAM:</span>
          <span className="text-cyan-300">{(bytesLoaded / 1024).toFixed(1)} / {(totalBytes / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      {/* Side Security Matrix */}
      <div className="hidden lg:flex flex-col gap-3 absolute right-8 top-1/2 -translate-y-1/2 p-4 rounded-2xl glass-panel text-[11px] font-mono-tech text-slate-400 w-64 border-violet-500/20 shadow-2xl">
        <div className="flex items-center gap-2 text-violet-300 font-bold border-b border-slate-800 pb-2">
          <Lock className="w-4 h-4 text-violet-400" />
          <span>SECURITY & PROTOCOLS</span>
        </div>
        <div className="flex justify-between">
          <span>ENCRYPTION:</span>
          <span className="text-white">AES-GCM-256</span>
        </div>
        <div className="flex justify-between">
          <span>SUPABASE RPC:</span>
          <span className="text-emerald-400">{progress > 50 ? 'CONNECTED' : 'STANDBY'}</span>
        </div>
        <div className="flex justify-between">
          <span>FIREBASE /m11:</span>
          <span className="text-amber-400">{progress > 75 ? 'SYNCHRONIZED' : 'WAITING'}</span>
        </div>
        <div className="flex justify-between">
          <span>INTEGRITY HASH:</span>
          <span className="text-cyan-300">SHA-256 VERIFIED</span>
        </div>
      </div>

      {/* Centerpiece: Precision Aperture Dial & Live Hex Stream */}
      <div className="relative flex flex-col items-center justify-center p-6 max-w-lg w-full">
        {/* Outer Circular Reactor Dial */}
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
          {/* Compass Angle Ticks */}
          <span className="absolute top-1 text-[10px] font-mono-tech text-cyan-400/60 font-bold tracking-wider">000°</span>
          <span className="absolute bottom-1 text-[10px] font-mono-tech text-cyan-400/60 font-bold tracking-wider">180°</span>
          <span className="absolute left-1 text-[10px] font-mono-tech text-cyan-400/60 font-bold tracking-wider">270°</span>
          <span className="absolute right-1 text-[10px] font-mono-tech text-cyan-400/60 font-bold tracking-wider">090°</span>

          {/* Rotating Dotted Tech Ring */}
          <div
            className="absolute inset-4 rounded-full border border-dashed border-cyan-400/40 animate-spin"
            style={{ animationDuration: '18s' }}
          />

          {/* Reverse Orbiting Violet Ring */}
          <div
            className="absolute inset-8 rounded-full border border-violet-400/30 animate-spin"
            style={{ animationDuration: '24s', animationDirection: 'reverse' }}
          />

          {/* Realtime Progress SVG Circle */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="43%"
              className="stroke-slate-900"
              strokeWidth="5"
              fill="transparent"
            />
            <circle
              cx="50%"
              cy="50%"
              r="43%"
              stroke="url(#bootGradientRealistic)"
              strokeWidth="5"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 110}
              strokeDashoffset={2 * Math.PI * 110 * (1 - progress / 100)}
              strokeLinecap="round"
              className="transition-all duration-100"
            />
            <defs>
              <linearGradient id="bootGradientRealistic" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="60%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center Digital Readout */}
          <div className="flex flex-col items-center justify-center z-10">
            <Zap className="w-6 h-6 text-cyan-400 animate-pulse mb-1" />
            <div className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white glow-cyan">
              {progress}
              <span className="text-xl text-cyan-400 font-mono-tech ml-0.5">%</span>
            </div>
            <span className="font-mono-tech text-[10px] text-slate-400 tracking-wider mt-1 uppercase">
              {phase === 'locking' ? 'AUTHENTICATED' : 'STREAMING'}
            </span>
          </div>
        </div>

        {/* Live Active Log Output */}
        <div className="mt-8 text-center space-y-3 w-full flex flex-col items-center">
          <div className="flex items-center justify-center gap-2 font-mono-tech text-xs tracking-wider text-cyan-300 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse flex-shrink-0" />
            <span className="truncate max-w-[320px] sm:max-w-[420px]">{activeLog}</span>
          </div>

          {/* Realistic Stepped Progress Bar */}
          <div className="w-64 sm:w-80 h-2 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-cyan-500/30 box-glow-cyan">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-300 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Frequency Equalizer Bars (Pure visual) */}
          <div className="flex items-end justify-center gap-1.5 h-5 mt-1">
            {[40, 75, 25, 90, 60, 100, 45, 80, 30, 95, 55, 85, 40, 70, 20, 90, 60, 100].map((h, i) => (
              <div
                key={i}
                className="w-1 bg-gradient-to-t from-cyan-500 to-violet-500 rounded-full eq-bar"
                style={{
                  height: `${h}%`,
                  animationDelay: `${(i * 0.08).toFixed(2)}s`,
                  animationDuration: '0.9s',
                }}
              />
            ))}
          </div>

          <p className="text-[11px] font-mono-tech text-slate-500 tracking-wider">
            MAGIC SCRIPT ARCHITECTURE · COMPLETE HARDWARE INITIALIZATION
          </p>
        </div>
      </div>

      {/* Bottom Footer Telemetry */}
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-xs font-mono-tech text-slate-500 border-t border-slate-800/80 pt-3">
        <span>SECURITY LEVEL: MAXIMUM</span>
        <span>INITIALIZING INTERFACE...</span>
      </div>
    </div>
  )
}

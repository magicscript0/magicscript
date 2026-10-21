import React, { useEffect, useState } from 'react'
import {
  Cpu,
  Zap,
  Radio,
  Terminal,
  ShieldCheck,
  Activity,
  Layers,
  Lock,
} from 'lucide-react'

interface BootLoaderProps {
  onComplete: () => void
}

const BOOT_STAGES = [
  { target: 20, label: 'ENGAGING QUANTUM CORE ENGINE', code: '0x01_CORE_INIT' },
  { target: 45, label: 'HANDSHAKING SUPABASE CLOUD RPC', code: '0x02_SUPA_SYNC' },
  { target: 70, label: 'CALIBRATING SPATIAL 3D HUD MATRIX', code: '0x03_SPATIAL_HUD' },
  { target: 88, label: 'ESTABLISHING FIREBASE /m11 BRIDGE', code: '0x04_RTDB_SYNC' },
  { target: 100, label: 'WARP TUNNEL ALIGNED · SYSTEM READY', code: '0x05_SYSTEM_READY' },
]

export const BootLoader: React.FC<BootLoaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [hexSnippet, setHexSnippet] = useState('0x7F40::CONNECTING')
  const [dissolving, setDissolving] = useState(false)
  const [novaFlash, setNovaFlash] = useState(false)
  const [tremor, setTremor] = useState(false)

  // Rapid hex scramble ticker
  useEffect(() => {
    const hexCodes = [
      '0x4A11::SHARD_ALPHA_ACTIVE',
      '0x8E32::AES_GCM_256_LOCKED',
      '0x9C04::SUPABASE_SESSION_OK',
      '0x12FF::QUANTUM_FLUX_STABLE',
      '0xBA07::RTDB_BRIDGE_ONLINE',
      '0xEE40::HUD_CALIBRATED_60FPS',
    ]
    const interval = setInterval(() => {
      setHexSnippet(hexCodes[Math.floor(Math.random() * hexCodes.length)])
    }, 160)
    return () => clearInterval(interval)
  }, [])

  // Progress interpolation curve
  useEffect(() => {
    let currentP = 0
    const duration = 2400 // 2.4s cinematic experience
    const start = performance.now()

    const frame = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 2.7)
      currentP = Math.round(eased * 100)
      setProgress(currentP)

      // Update stage
      const newStage = BOOT_STAGES.findIndex((s) => s.target >= currentP)
      if (newStage !== -1) setStageIndex(newStage)

      // Tremor near 100%
      if (currentP >= 95 && !tremor) {
        setTremor(true)
      }

      if (t < 1) {
        requestAnimationFrame(frame)
      } else {
        // Trigger Nova Flash
        setNovaFlash(true)
        setTimeout(() => {
          setDissolving(true)
          setTimeout(() => {
            onComplete()
          }, 450)
        }, 160)
      }
    }

    const anim = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(anim)
  }, [onComplete, tremor])

  const currentStage = BOOT_STAGES[stageIndex] || BOOT_STAGES[BOOT_STAGES.length - 1]

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030712]/92 backdrop-blur-2xl transition-all duration-500 ${
        dissolving ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      } ${tremor ? 'animate-pulse' : ''}`}
    >
      {/* Nova Flash Flare */}
      {novaFlash && (
        <div className="absolute inset-0 bg-cyan-200 pointer-events-none animate-ping opacity-35 z-50" />
      )}

      {/* Cyber Grid Pattern Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,254,0.06)_0,transparent_75%)] pointer-events-none" />

      {/* Top Header HUD */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-xs font-mono-tech">
        <div className="flex items-center gap-3 text-cyan-400">
          <Radio className="w-4 h-4 animate-pulse" />
          <span className="tracking-widest">NEXUS_OS // BOOT_KERNEL_V2.0</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-violet-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>{hexSnippet}</span>
        </div>
      </div>

      {/* Side Diagnostics Panel: Left (Hardware) */}
      <div className="hidden lg:flex flex-col gap-3 absolute left-8 top-1/2 -translate-y-1/2 p-4 rounded-2xl glass-panel text-[11px] font-mono-tech text-slate-400 w-56 border-cyan-500/20">
        <div className="flex items-center gap-2 text-cyan-300 font-bold border-b border-slate-800 pb-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>HARDWARE ENGINE</span>
        </div>
        <div className="flex justify-between">
          <span>RENDERER:</span>
          <span className="text-white">THREE_WEBGL2</span>
        </div>
        <div className="flex justify-between">
          <span>TARGET_FPS:</span>
          <span className="text-emerald-400">60 FPS LOCKED</span>
        </div>
        <div className="flex justify-between">
          <span>PARTICLES:</span>
          <span className="text-cyan-300">10,000 WARP</span>
        </div>
        <div className="flex justify-between">
          <span>VRAM_CACHE:</span>
          <span className="text-violet-300">1024 MB OK</span>
        </div>
      </div>

      {/* Side Diagnostics Panel: Right (Network & Crypto) */}
      <div className="hidden lg:flex flex-col gap-3 absolute right-8 top-1/2 -translate-y-1/2 p-4 rounded-2xl glass-panel text-[11px] font-mono-tech text-slate-400 w-56 border-violet-500/20">
        <div className="flex items-center gap-2 text-violet-300 font-bold border-b border-slate-800 pb-2">
          <Lock className="w-4 h-4 text-violet-400" />
          <span>SECURITY MATRIX</span>
        </div>
        <div className="flex justify-between">
          <span>CIPHER:</span>
          <span className="text-white">AES_GCM_256</span>
        </div>
        <div className="flex justify-between">
          <span>SUPABASE:</span>
          <span className="text-emerald-400">ACTIVE_RPC</span>
        </div>
        <div className="flex justify-between">
          <span>FIREBASE:</span>
          <span className="text-amber-400">/m11 SYNCED</span>
        </div>
        <div className="flex justify-between">
          <span>INTEGRITY:</span>
          <span className="text-cyan-300">100% VERIFIED</span>
        </div>
      </div>

      {/* Center Quantum Aperture Iris & Circular Dial */}
      <div className="relative flex flex-col items-center justify-center p-6 max-w-md w-full">
        {/* Concentric Rotating Tech Rings */}
        <div className="relative w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center">
          {/* Compass Angle Markers */}
          <span className="absolute top-1 text-[10px] font-mono-tech text-cyan-400/60 tracking-wider">000°</span>
          <span className="absolute bottom-1 text-[10px] font-mono-tech text-cyan-400/60 tracking-wider">180°</span>
          <span className="absolute left-1 text-[10px] font-mono-tech text-cyan-400/60 tracking-wider">270°</span>
          <span className="absolute right-1 text-[10px] font-mono-tech text-cyan-400/60 tracking-wider">090°</span>

          {/* Outer Dashed Cyan Gyro Ring */}
          <div
            className="absolute inset-3 rounded-full border border-dashed border-cyan-400/40 animate-spin"
            style={{ animationDuration: '14s' }}
          />

          {/* Inner Counter-Rotating Violet Ring */}
          <div
            className="absolute inset-7 rounded-full border border-violet-400/30 animate-spin"
            style={{ animationDuration: '20s', animationDirection: 'reverse' }}
          />

          {/* Progress Energy Arc (SVG) */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="43%"
              className="stroke-slate-800/80"
              strokeWidth="5"
              fill="transparent"
            />
            <circle
              cx="50%"
              cy="50%"
              r="43%"
              stroke="url(#bootGradientV2)"
              strokeWidth="5"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 110}
              strokeDashoffset={2 * Math.PI * 110 * (1 - progress / 100)}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
            <defs>
              <linearGradient id="bootGradientV2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </svg>

          {/* Central Reactor Power Display */}
          <div className="flex flex-col items-center justify-center z-10">
            <Zap className="w-7 h-7 text-cyan-300 animate-pulse mb-1" />
            <div className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white glow-cyan">
              {progress}
              <span className="text-xl text-cyan-400 font-mono-tech ml-0.5">%</span>
            </div>
            <div className="font-mono-tech text-[10px] tracking-widest text-slate-400 mt-1 uppercase">
              {currentStage.code}
            </div>
          </div>
        </div>

        {/* Status Stage Label */}
        <div className="mt-8 text-center space-y-3 w-full flex flex-col items-center">
          <div className="flex items-center justify-center gap-2 font-mono-tech text-xs tracking-widest text-cyan-300 uppercase">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>{currentStage.label}</span>
          </div>

          {/* Glowing multi-color bar */}
          <div className="w-64 sm:w-80 h-2 bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-cyan-500/30 box-glow-cyan">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-300 rounded-full transition-all duration-75 shadow-[0_0_12px_rgba(0,242,254,0.8)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Audio Equalizer Frequency Bars */}
          <div className="flex items-end justify-center gap-1.5 h-6 mt-2">
            {[40, 75, 25, 90, 60, 100, 45, 80, 30, 95, 55, 85, 40, 70, 20, 90, 60, 100].map((h, i) => (
              <div
                key={i}
                className="w-1 bg-gradient-to-t from-cyan-500 to-violet-500 rounded-full eq-bar"
                style={{
                  height: `${h}%`,
                  animationDelay: `${(i * 0.08).toFixed(2)}s`,
                  animationDuration: '0.8s',
                }}
              />
            ))}
          </div>

          <p className="text-[11px] font-mono-tech text-slate-500 tracking-wider">
            AUTHENTICATION PROTOCOL READY · THREE.JS ACCELERATED
          </p>
        </div>
      </div>

      {/* Bottom Footer Actions */}
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-xs font-mono-tech">
        <span className="text-slate-500">MAGIC SCRIPT NEXUS · QUANTUM EDITION</span>
        <button
          onClick={onComplete}
          className="text-slate-400 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-400/50 px-4 py-1.5 rounded-full transition-all tracking-wider shadow-lg"
        >
          [PRESS TO SKIP]
        </button>
      </div>
    </div>
  )
}

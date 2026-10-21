import React, { useEffect, useState } from 'react'
import { Cpu, ShieldCheck, Zap, Radio, Terminal } from 'lucide-react'

interface BootLoaderProps {
  onComplete: () => void
}

const BOOT_STAGES = [
  { target: 24, label: 'INITIALIZING QUANTUM RUNTIME', code: '0x01_CORE_INIT' },
  { target: 52, label: 'ESTABLISHING SECURE SUPABASE GATEWAY', code: '0x02_SUPA_SYNC' },
  { target: 78, label: 'CALIBRATING SPATIAL HUD & TELEMETRY', code: '0x03_HUD_CALIB' },
  { target: 94, label: 'CONNECTING FIREBASE REALTIME BRIDGE', code: '0x04_RTDB_LOCK' },
  { target: 100, label: 'SYSTEM VERIFIED · ACCESS READY', code: '0x05_NET_READY' },
]

export const BootLoader: React.FC<BootLoaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)
  const [hexTelemetry, setHexTelemetry] = useState('0x7F40::CONNECTING')
  const [dissolving, setDissolving] = useState(false)
  const [novaFlash, setNovaFlash] = useState(false)

  // Rapid hex scramble ticker
  useEffect(() => {
    const hexCodes = [
      '0x4A11::SHARD_ACTIVE',
      '0x8E32::AES_256_STABLE',
      '0x9C04::SUPABASE_OK',
      '0x12FF::NEBULA_BURST',
      '0xBA07::RTDB_SYNCED',
      '0xEE40::CORE_ALIGNED',
    ]
    const interval = setInterval(() => {
      setHexTelemetry(hexCodes[Math.floor(Math.random() * hexCodes.length)])
    }, 180)
    return () => clearInterval(interval)
  }, [])

  // Progress interpolation curve
  useEffect(() => {
    let currentP = 0
    let stage = 0
    const duration = 2200 // 2.2 seconds total immersive boot
    const start = performance.now()

    const frame = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 2.8)
      currentP = Math.round(eased * 100)
      setProgress(currentP)

      // Update stage
      const newStage = BOOT_STAGES.findIndex((s) => s.target >= currentP)
      if (newStage !== -1) setStageIndex(newStage)

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
        }, 150)
      }
    }

    const anim = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(anim)
  }, [onComplete])

  const currentStage = BOOT_STAGES[stageIndex] || BOOT_STAGES[BOOT_STAGES.length - 1]

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#030712]/90 backdrop-blur-xl transition-all duration-500 ${
        dissolving ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Nova Flash Flare */}
      {novaFlash && (
        <div className="absolute inset-0 bg-cyan-300 pointer-events-none animate-ping opacity-25 z-50" />
      )}

      {/* Cyber Corner HUD elements */}
      <div className="absolute top-6 left-8 flex items-center gap-3 font-mono-tech text-xs tracking-wider text-cyan-400/80">
        <Radio className="w-4 h-4 animate-pulse text-cyan-400" />
        <span>SYS_STATUS: BOOT_SEQUENCE</span>
      </div>

      <div className="absolute top-6 right-8 font-mono-tech text-xs text-violet-400/80 tracking-wider flex items-center gap-2">
        <Terminal className="w-4 h-4" />
        <span>{hexTelemetry}</span>
      </div>

      <div className="absolute bottom-6 left-8 font-mono-tech text-xs text-slate-500">
        <span>MAGIC SCRIPT NEXUS · V2.0</span>
      </div>

      <div className="absolute bottom-6 right-8">
        <button
          onClick={onComplete}
          className="text-xs font-mono-tech text-slate-400 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/50 px-3 py-1.5 rounded-full transition-all tracking-wider"
        >
          [SKIP INTRO]
        </button>
      </div>

      {/* Central Holographic Reactor Aperture */}
      <div className="relative flex flex-col items-center justify-center p-8 max-w-lg w-full">
        {/* Outer Rotating Energy Ring */}
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
          {/* Outer dashed ring */}
          <div
            className="absolute inset-0 rounded-full border border-dashed border-cyan-500/40 animate-spin"
            style={{ animationDuration: '16s' }}
          />

          {/* Reverse spinning violet ring */}
          <div
            className="absolute inset-2 rounded-full border border-violet-500/30 animate-spin"
            style={{ animationDuration: '22s', animationDirection: 'reverse' }}
          />

          {/* Glowing Arc Gradient Ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="44%"
              className="stroke-slate-800/80"
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="50%"
              cy="50%"
              r="44%"
              stroke="url(#bootGradient)"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 105}
              strokeDashoffset={2 * Math.PI * 105 * (1 - progress / 100)}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
            <defs>
              <linearGradient id="bootGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="60%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </svg>

          {/* Central Reactor Core with live percentage */}
          <div className="flex flex-col items-center justify-center z-10">
            <Zap className="w-6 h-6 text-cyan-400 animate-pulse mb-1" />
            <div className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white glow-cyan">
              {progress}
              <span className="text-xl text-cyan-400 font-mono-tech ml-0.5">%</span>
            </div>
            <div className="font-mono-tech text-[10px] tracking-widest text-slate-400 mt-1 uppercase">
              {currentStage.code}
            </div>
          </div>
        </div>

        {/* Status Stage Label */}
        <div className="mt-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-mono-tech text-xs tracking-widest text-cyan-300 uppercase">
            <Cpu className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>{currentStage.label}</span>
          </div>

          {/* Slim segmented progress bar */}
          <div className="w-64 sm:w-80 h-1.5 bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-cyan-500/20 shadow-[0_0_15px_rgba(0,242,254,0.15)]">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-300 rounded-full transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-[11px] font-mono-tech text-slate-500 tracking-wider">
            QUANTUM SPATIAL SECURE HANDSHAKE · AES-GCM 256
          </p>
        </div>
      </div>
    </div>
  )
}

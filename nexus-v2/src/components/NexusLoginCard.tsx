import React, { useState, useRef, useEffect, FormEvent } from 'react'
import {
  KeyRound,
  Hash,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Shield,
  Lock,
  CheckCircle2,
  Zap,
  Radio,
  X,
} from 'lucide-react'
import type { PublicSettings } from '../services/auth'
import { playLaserClick, playTelemetryBlip } from '../utils/audio'

interface NexusLoginCardProps {
  settings: PublicSettings
  onLogin: (accountId: string, code: string) => Promise<void>
  loading: boolean
  error: string | null
}

export const NexusLoginCard: React.FC<NexusLoginCardProps> = ({
  settings,
  onLogin,
  loading,
  error,
}) => {
  const [accountId, setAccountId] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // 3D Tilt & Glare State
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glareX: 50, glareY: 50 })
  const isHoveredRef = useRef(false)

  // Mobile/idle ambient floating effect when not actively hovered
  useEffect(() => {
    let animId: number
    let t = 0
    const float = () => {
      animId = requestAnimationFrame(float)
      if (!isHoveredRef.current) {
        t += 0.02
        setTilt({
          rx: Math.sin(t) * 2.5,
          ry: Math.cos(t * 0.8) * 3,
          glareX: 50 + Math.sin(t) * 15,
          glareY: 50 + Math.cos(t * 0.8) * 15,
        })
      }
    }
    animId = requestAnimationFrame(float)
    return () => cancelAnimationFrame(animId)
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    isHoveredRef.current = true
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const maxTilt = 9 // degrees
    const ry = ((x - centerX) / centerX) * maxTilt
    const rx = -((y - centerY) / centerY) * maxTilt

    const glareX = (x / rect.width) * 100
    const glareY = (y / rect.height) * 100

    setTilt({ rx, ry, glareX, glareY })
  }

  const handleMouseLeave = () => {
    isHoveredRef.current = false
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    playLaserClick()
    onLogin(accountId, accessCode)
  }

  // Quick Demo Autofill Helper
  const handleAutofillDemo = () => {
    playLaserClick()
    setAccountId('583920194')
    setAccessCode('NEXUS-7782-XVIP')
  }

  const handleAccountIdChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '')
    setAccountId(cleaned)
    playTelemetryBlip(920, 0.02)
  }

  const isAccountValid = accountId.length >= 9 && accountId.length <= 11

  return (
    <div className="relative z-30 perspective-container w-full max-w-md px-4">
      {/* Outer Border Beam Wrapper */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
          transition: isHoveredRef.current ? 'transform 0.12s ease-out' : 'transform 0.4s ease-out',
        }}
        className="relative rounded-3xl p-[1.5px] border-beam-container shadow-[0_30px_90px_-15px_rgba(0,0,0,0.95),0_0_45px_rgba(0,242,254,0.22)]"
      >
        {/* Inner Card Chassis */}
        <div className="relative rounded-[23px] border-beam-inner p-8 sm:p-10 overflow-hidden">
          {/* Dynamic Glare Reflection Sheen */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle 380px at ${tilt.glareX}% ${tilt.glareY}%, rgba(0, 242, 254, 0.16), transparent 70%)`,
            }}
          />

          {/* Cyber Corner Precision Brackets */}
          <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-cyan-400/70" />
          <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-cyan-400/70" />
          <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-violet-400/70" />
          <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-violet-400/70" />

          {/* Card Header & Brand Lockup */}
          <div className="text-center space-y-2 mb-8 relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono-tech tracking-wider mb-1 shadow-[0_0_15px_rgba(0,242,254,0.2)]">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>QUANTUM ENCRYPTED ACCESS</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white glow-cyan">
              {settings.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 font-normal">
              {settings.caption}
            </p>
          </div>

          {/* Error Alert Banner */}
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs font-mono-tech flex items-start gap-2.5 animate-pulse shadow-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            {/* Account ID Slot */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono-tech">
                <label className="text-slate-300 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                  <span>ACCOUNT ID</span>
                </label>
                {accountId.length > 0 ? (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                      isAccountValid
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 glow-cyan'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isAccountValid ? '✓ READY' : `${accountId.length}/11 DIGITS`}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">9-11 DIGITS</span>
                )}
              </div>

              <div className="relative group">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={11}
                  value={accountId}
                  onChange={(e) => handleAccountIdChange(e.target.value)}
                  placeholder="e.g. 583920194"
                  required
                  className="w-full bg-[#030712]/85 border border-slate-700/80 group-hover:border-cyan-500/50 focus:border-cyan-400 focus:box-glow-cyan text-white text-sm font-mono-tech rounded-xl px-4 py-3.5 pl-11 pr-10 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                />
                <Shield className="w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" />

                {accountId.length > 0 && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {isAccountValid && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <button
                      type="button"
                      onClick={() => setAccountId('')}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Access Code Slot */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono-tech">
                <label className="text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-violet-400" />
                  <span>ACCESS CODE</span>
                </label>
                <span className="text-[10px] text-slate-500">AES-256</span>
              </div>

              <div className="relative group">
                <input
                  type={showCode ? 'text' : 'password'}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter access code"
                  required
                  className="w-full bg-[#030712]/85 border border-slate-700/80 group-hover:border-violet-500/50 focus:border-violet-400 focus:box-glow-violet text-white text-sm font-mono-tech rounded-xl px-4 py-3.5 pl-11 pr-11 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                />
                <Lock className="w-4 h-4 text-slate-500 group-focus-within:text-violet-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Demo Autofill Helper Pill */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleAutofillDemo}
                className="text-[11px] font-mono-tech text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1 transition-colors hover:underline"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Auto-fill Demo Code</span>
              </button>
            </div>

            {/* High-Voltage Ignition Launch Button */}
            <button
              type="submit"
              disabled={loading || !accountId || !accessCode}
              className="relative w-full group overflow-hidden rounded-xl font-display font-bold text-sm tracking-wider uppercase text-white py-4 px-6 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(0,242,254,0.35)] hover:shadow-[0_0_40px_rgba(0,242,254,0.6)] shimmer-trigger mt-3"
            >
              {/* Gradient Base */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 transition-all duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Inner outline */}
              <div className="absolute inset-[1px] rounded-[11px] bg-[#030712]/20 backdrop-blur-[2px] transition-all group-hover:bg-transparent" />

              {/* Button Text & Icons */}
              <div className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>VERIFYING SECURE KEY...</span>
                  </>
                ) : (
                  <>
                    <span>IGNITE ACCESS SESSION</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>

          {/* Footer inside card */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono-tech text-slate-500 relative z-10">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>SUPABASE RPC · 12ms</span>
            </span>
            <span className="text-cyan-400/90 font-medium">STATUS: ENCRYPTED</span>
          </div>
        </div>
      </div>
    </div>
  )
}

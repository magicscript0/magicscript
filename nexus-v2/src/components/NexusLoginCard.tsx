import React, { useState, useRef, FormEvent } from 'react'
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
} from 'lucide-react'
import type { PublicSettings } from '../services/auth'

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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const maxTilt = 8 // degrees
    const ry = ((x - centerX) / centerX) * maxTilt
    const rx = -((y - centerY) / centerY) * maxTilt

    const glareX = (x / rect.width) * 100
    const glareY = (y / rect.height) * 100

    setTilt({ rx, ry, glareX, glareY })
  }

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, glareX: 50, glareY: 50 })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    onLogin(accountId, accessCode)
  }

  const isAccountValid = accountId.length >= 9 && accountId.length <= 11

  return (
    <div className="relative z-30 perspective-container w-full max-w-md px-4">
      {/* 3D Tilting Card */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
          transition: 'transform 0.15s ease-out',
        }}
        className="relative rounded-3xl glass-panel-elevated p-8 sm:p-10 border border-cyan-500/30 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(0,242,254,0.12)]"
      >
        {/* Dynamic Glare Reflection Sheen */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 320px at ${tilt.glareX}% ${tilt.glareY}%, rgba(0, 242, 254, 0.14), transparent 70%)`,
          }}
        />

        {/* Ambient Top Glow Line */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        {/* Card Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-mono-tech tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>SECURE ACCESS TERMINAL</span>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white glow-cyan">
            {settings.title}
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 font-normal">
            {settings.caption}
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-mono-tech flex items-start gap-2.5 animate-pulse">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Account ID Slot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono-tech">
              <label className="text-slate-300 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-cyan-400" />
                <span>ACCOUNT ID</span>
              </label>
              {accountId.length > 0 && (
                <span
                  className={`text-[10px] ${
                    isAccountValid ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {accountId.length} / 9-11 digits
                </span>
              )}
            </div>

            <div className="relative group">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={11}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 529184710"
                required
                className="w-full bg-[#030712]/75 border border-slate-700/80 group-hover:border-cyan-500/40 focus:border-cyan-400 focus:box-glow-cyan text-white text-sm font-mono-tech rounded-xl px-4 py-3.5 pl-11 outline-none transition-all placeholder:text-slate-600"
              />
              <Shield className="w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" />
              {isAccountValid && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-4 top-1/2 -translate-y-1/2" />
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
              <span className="text-[10px] text-slate-500">Encrypted</span>
            </div>

            <div className="relative group">
              <input
                type={showCode ? 'text' : 'password'}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter provided code"
                required
                className="w-full bg-[#030712]/75 border border-slate-700/80 group-hover:border-violet-500/40 focus:border-violet-400 focus:box-glow-violet text-white text-sm font-mono-tech rounded-xl px-4 py-3.5 pl-11 pr-11 outline-none transition-all placeholder:text-slate-600"
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

          {/* High-Voltage Ignition Launch Button */}
          <button
            type="submit"
            disabled={loading || !accountId || !accessCode}
            className="relative w-full group overflow-hidden rounded-xl font-display font-bold text-sm tracking-wider uppercase text-white py-4 px-6 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(0,242,254,0.3)] hover:shadow-[0_0_35px_rgba(0,242,254,0.5)] mt-4"
          >
            {/* Multi-gradient animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 transition-all duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Glowing border outline */}
            <div className="absolute inset-[1px] rounded-[11px] bg-[#030712]/30 backdrop-blur-[2px] transition-all group-hover:bg-transparent" />

            {/* Button Inner Content */}
            <div className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>AUTHORIZING SECURE KEY...</span>
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

        {/* Footer info inside card */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono-tech text-slate-500">
          <span>MAGIC SCRIPT PROTOCOL</span>
          <span className="text-cyan-400/80">NODE_STATUS: VERIFIED</span>
        </div>
      </div>
    </div>
  )
}

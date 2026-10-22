import React, { useState, useRef, useEffect, FormEvent, useCallback } from 'react'
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
  X,
} from 'lucide-react'
import type { PublicSettings } from '../services/auth'
import {
  normalizeAccountId,
  describeAccountIdIssue,
  describeAccessCodeIssue,
} from '../services/gameAccess'

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
  const [showCode, setShowCode] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)

  // Simulated Loading State (~1.9s high-tech multi-step verification sequence)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyStage, setVerifyStage] = useState(0) // 0: Cipher, 1: 1xBet Handshake, 2: Timelock
  const [verifyProgress, setVerifyProgress] = useState(0)
  const [isShaking, setIsShaking] = useState(false)
  const verifyTimerRef = useRef<number | null>(null)

  // Progressive brute-force lockout / rate-limiting state
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  // Clear verification timer on unmount
  useEffect(() => {
    return () => {
      if (verifyTimerRef.current) window.clearInterval(verifyTimerRef.current)
    }
  }, [])

  // Trigger error shake micro-interaction & progressive lockout on errors
  useEffect(() => {
    if (error || localError) {
      setIsShaking(true)
      const shakeTimer = window.setTimeout(() => setIsShaking(false), 500)

      setFailedAttempts((prev) => {
        const next = prev + 1
        if (next >= 5) {
          setCooldownSeconds(30)
        } else if (next >= 4) {
          setCooldownSeconds(15)
        } else if (next >= 3) {
          setCooldownSeconds(5)
        }
        return next
      })

      return () => window.clearTimeout(shakeTimer)
    }
  }, [error, localError])

  // Cooldown countdown tick
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const interval = window.setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [cooldownSeconds])

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setAccessCode(text.trim().toUpperCase())
      }
    } catch {
      // Clipboard permission might be denied
    }
  }

  // 3D Tilt & Dynamic Glare:
  // Desktop-only, direct DOM style mutation with zero React state re-renders
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only apply 3D tilt on fine-pointer desktop devices with hover capability
    if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return
    }

    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const maxTilt = 7 // subtle degrees
    const ry = ((x - centerX) / centerX) * maxTilt
    const rx = -((y - centerY) / centerY) * maxTilt

    card.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`
    card.style.transition = 'transform 0.08s ease-out'

    if (glareRef.current) {
      const glareX = ((x / rect.width) * 100).toFixed(1)
      const glareY = ((y / rect.height) * 100).toFixed(1)
      glareRef.current.style.background = `radial-gradient(circle 340px at ${glareX}% ${glareY}%, rgba(0, 242, 254, 0.16), transparent 70%)`
      glareRef.current.style.opacity = '1'
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current
    if (card) {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)'
      card.style.transition = 'transform 0.4s ease-out'
    }
    if (glareRef.current) {
      glareRef.current.style.opacity = '0'
    }
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (loading || isVerifying || cooldownSeconds > 0) return
    setLocalError(null)

    const cleanAccountId = normalizeAccountId(accountId)
    const accountIdIssue = describeAccountIdIssue(cleanAccountId)
    if (accountIdIssue) {
      setLocalError(accountIdIssue)
      return
    }

    const cleanCode = accessCode.trim().toUpperCase()
    const codeIssue = describeAccessCodeIssue(cleanCode)
    if (codeIssue) {
      setLocalError(codeIssue)
      return
    }

    // Trigger high-tech simulated loading sequence (~1.9s)
    setIsVerifying(true)
    setVerifyProgress(0)
    setVerifyStage(0)

    const startTime = Date.now()
    const totalDuration = 1900 // 1.9s

    verifyTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(100, Math.round((elapsed / totalDuration) * 100))
      setVerifyProgress(pct)

      if (pct < 38) {
        setVerifyStage(0)
      } else if (pct < 78) {
        setVerifyStage(1)
      } else {
        setVerifyStage(2)
      }

      if (elapsed >= totalDuration) {
        if (verifyTimerRef.current) clearInterval(verifyTimerRef.current)
        setIsVerifying(false)
        onLogin(cleanAccountId, cleanCode)
          .then(() => {
            // Reset failed counter on successful ignition
            setFailedAttempts(0)
            setCooldownSeconds(0)
          })
          .catch(() => {})
      }
    }, 60)
  }

  const handleAccountIdChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '')
    setAccountId(cleaned)
  }

  const isAccountValid = accountId.length >= 9 && accountId.length <= 11

  // Clean title: remove any leftover "Nexus 3D"
  const displayTitle = (settings.title || 'Apple of Fortune').replace(/\s*·?\s*Nexus\s*3D/gi, '').trim() || 'Apple of Fortune'

  // Format error with high-tech gaming tone
  const rawError = localError || error
  const displayError = rawError
    ? rawError.toLowerCase().includes('no longer active') ||
      rawError.toLowerCase().includes('not valid') ||
      rawError.toLowerCase().includes('unauthorized') ||
      rawError.toLowerCase().includes('access denied') ||
      rawError.toLowerCase().includes('invalid')
      ? 'ACCESS DENIED — Invalid or Unauthorized Access Key. Please verify your credentials.'
      : rawError
    : null

  return (
    <div className="relative z-30 perspective-container w-[min(94vw,440px)] mx-auto px-1 sm:px-0 transition-all duration-700 ease-out animate-[fadeInScale_0.7s_ease-out]">
      {/* Outer Border Beam Wrapper with Ambient Floating Animation */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0)',
          willChange: 'transform',
        }}
        className="relative rounded-3xl p-[1.5px] border-beam-container shadow-[0_24px_70px_-15px_rgba(0,0,0,0.95),0_0_35px_rgba(0,242,254,0.18)] animate-card-float touch-manipulation"
      >
        {/* Inner Card Chassis */}
        <div className="relative rounded-[23px] border-beam-inner p-6 sm:p-9 overflow-hidden">
          {/* Dynamic Glare Reflection Sheen (Updated directly on desktop hover) */}
          <div
            ref={glareRef}
            className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300"
            style={{
              background: 'radial-gradient(circle 340px at 50% 50%, rgba(0, 242, 254, 0.16), transparent 70%)',
            }}
          />

          {/* Cyber Corner Precision Brackets */}
          <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-cyan-400/70 pointer-events-none" />
          <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-cyan-400/70 pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-violet-400/70 pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-violet-400/70 pointer-events-none" />

          {/* Card Header & Brand Lockup */}
          <div className="text-center space-y-2 mb-6 sm:mb-7 relative z-10 pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono-tech tracking-wider shadow-[0_0_15px_rgba(0,242,254,0.2)]">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>QUANTUM ENCRYPTED ACCESS</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white glow-cyan">
              {displayTitle}
            </h1>

            {/* 1xBet Compatibility Badge */}
            <div className="flex items-center justify-center pt-0.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-emerald-300 text-[10.5px] sm:text-[11px] font-mono-tech tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.18)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="font-semibold uppercase tracking-wider">
                  ACTIVE ENGINE • OPTIMIZED FOR 1XBET APP
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 font-normal pt-1">
              {settings.caption}
            </p>
          </div>

          {/* Custom Sleek Cyber Error Alert */}
          {displayError && (
            <div
              className={`mb-5 p-3.5 sm:p-4 rounded-xl bg-red-950/40 border border-red-500/60 text-red-200 text-xs font-mono-tech flex items-start gap-3 shadow-[0_0_25px_rgba(239,68,68,0.3),inset_0_0_15px_rgba(239,68,68,0.15)] relative overflow-hidden backdrop-blur-md ${
                isShaking ? 'animate-cyber-shake' : ''
              }`}
            >
              <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none overflow-hidden">
                <div className="absolute transform rotate-45 bg-red-500/30 text-[8px] font-bold text-red-200 py-0.5 right-[-25px] top-[6px] w-[70px] text-center">
                  ERR
                </div>
              </div>

              <div className="p-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 flex-shrink-0">
                <AlertCircle className="w-4 h-4 animate-pulse" />
              </div>

              <div className="flex-1 pr-4">
                <div className="text-[10px] tracking-wider uppercase text-red-400/90 font-bold mb-0.5">
                  SECURITY EXCEPTION
                </div>
                <div className="leading-relaxed font-semibold text-red-100">
                  {displayError}
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 relative z-10 touch-manipulation">
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
                  autoComplete="off"
                  className="w-full bg-[#030712]/90 border border-slate-700/80 group-hover:border-cyan-500/50 focus:border-cyan-400 focus:box-glow-cyan text-white text-base sm:text-sm font-mono-tech rounded-xl px-4 py-3 sm:py-3.5 pl-11 pr-10 outline-none transition-all placeholder:text-slate-600 shadow-inner select-text touch-manipulation"
                />
                <Shield className="w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" />

                {accountId.length > 0 && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {isAccountValid && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <button
                      type="button"
                      onClick={() => setAccountId('')}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1 touch-manipulation"
                      aria-label="Clear account ID"
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
                  autoComplete="off"
                  className="w-full bg-[#030712]/90 border border-slate-700/80 group-hover:border-violet-500/50 focus:border-violet-400 focus:box-glow-violet text-white text-base sm:text-sm font-mono-tech rounded-xl px-4 py-3 sm:py-3.5 pl-11 pr-11 outline-none transition-all placeholder:text-slate-600 shadow-inner select-text touch-manipulation"
                />
                <Lock className="w-4 h-4 text-slate-500 group-focus-within:text-violet-400 absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1 touch-manipulation"
                  aria-label={showCode ? 'Hide access code' : 'Show access code'}
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Paste Clipboard Helper */}
            <div className="flex justify-end items-center pt-0.5 text-[11px] font-mono-tech">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-cyan-400/90 hover:text-cyan-300 flex items-center gap-1.5 transition-colors hover:underline px-2.5 py-1 rounded-lg hover:bg-cyan-500/10 touch-manipulation active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Paste from Clipboard</span>
              </button>
            </div>

            {/* High-Voltage Ignition Launch Button with Progressive Lockout */}
            <button
              type="submit"
              disabled={loading || isVerifying || cooldownSeconds > 0 || !accountId || !accessCode}
              className={`relative w-full group overflow-hidden rounded-xl font-display font-bold text-sm tracking-wider uppercase text-white py-3.5 sm:py-4 px-6 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(0,242,254,0.35)] hover:shadow-[0_0_40px_rgba(0,242,254,0.6)] shimmer-trigger mt-3 touch-manipulation active:scale-[0.99] ${
                cooldownSeconds > 0 ? 'border border-amber-500/50 bg-amber-950/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : ''
              }`}
            >
              {/* Gradient Base */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 transition-all duration-500 group-hover:scale-105 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Inner outline */}
              <div className="absolute inset-[1px] rounded-[11px] bg-[#030712]/20 backdrop-blur-[2px] transition-all group-hover:bg-transparent pointer-events-none" />

              {/* Dynamic Cybernetic Progress Fill Bar */}
              {(isVerifying || loading) && (
                <div
                  className="absolute bottom-0 left-0 top-0 bg-gradient-to-r from-cyan-400/40 via-violet-400/50 to-emerald-400/50 transition-all duration-150 pointer-events-none"
                  style={{ width: `${isVerifying ? verifyProgress : 100}%` }}
                />
              )}

              {/* Button Text & Neural Ring Loading Sequence */}
              <div className="relative z-10 flex items-center justify-center gap-2.5 pointer-events-none">
                {cooldownSeconds > 0 ? (
                  <span className="font-mono-tech text-xs text-amber-300 font-bold tracking-widest flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    SECURITY COOLDOWN [{cooldownSeconds}s]
                  </span>
                ) : isVerifying ? (
                  <>
                    <div className="relative w-5 h-5 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                      <div className="absolute w-2.5 h-2.5 rounded-full border border-violet-400/40 border-b-violet-400 animate-orbit-reverse" />
                    </div>
                    <span className="font-mono-tech text-xs tracking-wider text-cyan-200">
                      {verifyStage === 0 && 'ENCRYPTING CIPHER...'}
                      {verifyStage === 1 && '1XBET ENGINE HANDSHAKE...'}
                      {verifyStage === 2 && 'TIMELOCK VERIFICATION...'}
                    </span>
                    <span className="font-mono-tech text-[11px] text-white/80 font-bold ml-1">
                      [{verifyProgress}%]
                    </span>
                  </>
                ) : loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>FINALIZING ACCESS...</span>
                  </>
                ) : (
                  <>
                    <span>IGNITE ACCESS SESSION</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-cyan-300" />
                  </>
                )}
              </div>
            </button>
          </form>

          {/* Footer inside card */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[10.5px] sm:text-[11px] font-mono-tech text-slate-500 relative z-10 pointer-events-none">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-slate-400 font-medium">LIVE ENGINE SYNC</span>
            </span>
            <span className="text-cyan-400/90 font-medium tracking-wider">STATUS: ENCRYPTED // AES-256</span>
          </div>
        </div>
      </div>
    </div>
  )
}

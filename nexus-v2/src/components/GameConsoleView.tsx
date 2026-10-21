import React, { useEffect, useState } from 'react'
import {
  LogOut,
  Clock,
  Radio,
  Sparkles,
  ShieldCheck,
  Flame,
  CheckCircle,
  HelpCircle,
  Award,
} from 'lucide-react'
import { subscribeToM11 } from '../config/firebase'

interface GameConsoleViewProps {
  accountId: string
  expiresAt: string
  onLogout: () => void
}

const MULTIPLIERS = [
  '12.72x',
  '9.54x',
  '7.15x',
  '5.36x',
  '4.02x',
  '3.02x',
  '2.41x',
  '1.93x',
  '1.54x',
  '1.23x',
]

export const GameConsoleView: React.FC<GameConsoleViewProps> = ({
  accountId,
  expiresAt,
  onLogout,
}) => {
  const [timeLeft, setTimeLeft] = useState('')
  const [m11Data, setM11Data] = useState<any>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)

  // Session Countdown Timer
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now()
      const end = new Date(expiresAt).getTime()
      const diff = Math.max(0, end - now)

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeLeft(
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      )
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  // Firebase Realtime Listener
  useEffect(() => {
    const unsubscribe = subscribeToM11((val) => {
      setM11Data(val)
    })
    return () => unsubscribe()
  }, [])

  return (
    <div className="relative z-30 w-full max-w-4xl px-4 py-8">
      {/* Top Session Ribbon */}
      <div className="glass-panel-elevated rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4 border border-cyan-500/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-tech text-slate-400">AUTHENTICATED ID:</span>
              <span className="font-mono-tech font-bold text-white tracking-wide text-sm">
                #{accountId}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono-tech text-emerald-400">
                ACTIVE ACCESS GRANTED
              </span>
            </div>
          </div>
        </div>

        {/* Remaining Session Time */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 font-mono-tech text-xs">
            <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-slate-400">SESSION EXPIRES:</span>
            <span className="text-white font-bold">{timeLeft}</span>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-mono-tech text-xs transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>DISCONNECT</span>
          </button>
        </div>
      </div>

      {/* Main Game Interface Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Ladder of Multipliers */}
        <div className="glass-panel rounded-2xl p-5 border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <span className="text-xs font-mono-tech text-slate-300 font-bold flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>TIER MULTIPLIERS</span>
            </span>
            <span className="text-[10px] font-mono-tech text-cyan-400">10 STEPS</span>
          </div>

          <div className="space-y-1.5">
            {MULTIPLIERS.map((mul, idx) => {
              const step = 10 - idx
              return (
                <div
                  key={step}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono-tech transition-all ${
                    idx === 9
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900/40 text-slate-400 border border-slate-800/60'
                  }`}
                >
                  <span className="text-[11px] text-slate-500">LEVEL {step}</span>
                  <span className="font-bold text-white">{mul}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center: Live 5-Column Grid */}
        <div className="md:col-span-2 glass-panel rounded-2xl p-6 border border-cyan-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-cyan-400" />
                <h3 className="font-display font-bold text-white text-base">
                  APPLE OF FORTUNE · LIVE RADAR
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono-tech text-slate-400">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>RTDB SYNCED</span>
              </div>
            </div>

            {/* Interactive Grid Simulation (5 Columns x 10 Rows) */}
            <div className="space-y-2">
              {[...Array(6)].map((_, rowIdx) => {
                const rowNum = 6 - rowIdx
                return (
                  <div key={rowIdx} className="flex items-center gap-2">
                    <span className="w-6 text-[11px] font-mono-tech text-slate-500 text-center">
                      R{rowNum}
                    </span>
                    <div className="grid grid-cols-5 gap-2 flex-1">
                      {[0, 1, 2, 3, 4].map((colIdx) => {
                        const cellId = rowNum * 10 + colIdx
                        const isPicked = selectedCell === cellId
                        return (
                          <button
                            key={colIdx}
                            onClick={() => setSelectedCell(cellId)}
                            className={`h-10 rounded-xl border flex items-center justify-center transition-all ${
                              isPicked
                                ? 'bg-cyan-500/30 border-cyan-400 shadow-[0_0_15px_rgba(0,242,254,0.4)]'
                                : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/30 hover:bg-slate-800/60'
                            }`}
                          >
                            {isPicked ? (
                              <Sparkles className="w-4 h-4 text-cyan-300 animate-bounce" />
                            ) : (
                              <HelpCircle className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Telemetry info bar */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-mono-tech text-slate-400">
            <span>PREDICTION ENGINE: ONLINE</span>
            <span className="text-cyan-400">M11_NODE_ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  )
}

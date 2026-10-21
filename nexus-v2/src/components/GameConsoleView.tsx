import React, { useEffect, useState } from 'react'
import {
  LogOut,
  Clock,
  Radio,
  Sparkles,
  ShieldCheck,
  Flame,
  Award,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import { subscribeToM11 } from '../config/firebase'
import { playLaserClick, playCyberNovaChime, playTelemetryBlip } from '../utils/audio'

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
  const [currentRow, setCurrentRow] = useState(1) // 1 to 10
  const [selectedCells, setSelectedCells] = useState<Record<number, number>>({}) // row -> col
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)

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
      // Realtime signal received
    })
    return () => unsubscribe()
  }, [])

  const handleCellClick = (row: number, col: number) => {
    if (gameOver || won) return
    if (row !== currentRow) return

    playLaserClick()

    // 4 out of 5 columns are safe on lower rows
    const isSafe = Math.random() < (row < 5 ? 0.85 : 0.7)

    if (isSafe) {
      setSelectedCells((prev) => ({ ...prev, [row]: col }))
      playTelemetryBlip(1200, 0.05)

      if (row >= 10) {
        setWon(true)
        playCyberNovaChime()
      } else {
        setCurrentRow(row + 1)
      }
    } else {
      setSelectedCells((prev) => ({ ...prev, [row]: col }))
      setGameOver(true)
    }
  }

  const handleResetGame = () => {
    playLaserClick()
    setCurrentRow(1)
    setSelectedCells({})
    setGameOver(false)
    setWon(false)
  }

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

        {/* Remaining Session Time & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 font-mono-tech text-xs">
            <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-slate-400">SESSION EXPIRES:</span>
            <span className="text-white font-bold">{timeLeft}</span>
          </div>

          <button
            onClick={() => {
              playLaserClick()
              onLogout()
            }}
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
              const isCurrent = step === currentRow
              const isPassed = step < currentRow

              return (
                <div
                  key={step}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono-tech transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/25 border border-cyan-400 text-white shadow-[0_0_15px_rgba(0,242,254,0.35)] font-bold scale-[1.02]'
                      : isPassed
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900/40 text-slate-500 border border-slate-800/60'
                  }`}
                >
                  <span className="text-[11px]">LEVEL {step}</span>
                  <span className="font-bold">{mul}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center: Live Interactive 5-Column Grid */}
        <div className="md:col-span-2 glass-panel rounded-2xl p-6 border border-cyan-500/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-cyan-400" />
                <h3 className="font-display font-bold text-white text-base">
                  APPLE OF FORTUNE · INTERACTIVE RADAR
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetGame}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono-tech text-slate-300 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>RESET</span>
                </button>
                <div className="flex items-center gap-1.5 text-xs font-mono-tech text-slate-400">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>RTDB SYNC</span>
                </div>
              </div>
            </div>

            {/* Victory / Defeat Overlay Banner */}
            {won && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-between text-amber-200 font-mono-tech text-xs animate-bounce">
                <span className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>MAX LEVEL 10 REACHED! MULTIPLIER 12.72x WON!</span>
                </span>
                <button
                  onClick={handleResetGame}
                  className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold text-xs"
                >
                  PLAY AGAIN
                </button>
              </div>
            )}

            {gameOver && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-500/20 border border-red-500/50 flex items-center justify-between text-red-200 font-mono-tech text-xs">
                <span>ROUND OVER ON LEVEL {currentRow}. TAP RESET TO RE-ARM RADAR.</span>
                <button
                  onClick={handleResetGame}
                  className="px-3 py-1 rounded bg-red-500 text-white font-bold text-xs"
                >
                  RE-ARM
                </button>
              </div>
            )}

            {/* 10-Row Grid Matrix */}
            <div className="space-y-1.5">
              {[...Array(10)].map((_, rowIdx) => {
                const rowNum = 10 - rowIdx
                const isRowActive = rowNum === currentRow && !gameOver && !won
                const isRowPassed = rowNum < currentRow

                return (
                  <div
                    key={rowIdx}
                    className={`flex items-center gap-2 p-1 rounded-xl transition-all ${
                      isRowActive
                        ? 'bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,242,254,0.15)]'
                        : ''
                    }`}
                  >
                    <span className="w-7 text-[10px] font-mono-tech text-slate-500 text-center">
                      R{rowNum}
                    </span>
                    <div className="grid grid-cols-5 gap-2 flex-1">
                      {[0, 1, 2, 3, 4].map((colIdx) => {
                        const isPicked = selectedCells[rowNum] === colIdx

                        return (
                          <button
                            key={colIdx}
                            disabled={!isRowActive || gameOver || won}
                            onClick={() => handleCellClick(rowNum, colIdx)}
                            className={`h-8 sm:h-9 rounded-lg border flex items-center justify-center transition-all ${
                              isPicked
                                ? isRowPassed || won
                                  ? 'bg-emerald-500/30 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                                  : 'bg-red-500/30 border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                                : isRowActive
                                ? 'bg-slate-900/80 border-cyan-500/40 hover:border-cyan-300 hover:bg-cyan-500/20 cursor-pointer shadow-sm'
                                : 'bg-slate-900/30 border-slate-800/50 cursor-not-allowed opacity-60'
                            }`}
                          >
                            {isPicked ? (
                              isRowPassed || won ? (
                                <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
                              ) : (
                                <span className="text-xs">💥</span>
                              )
                            ) : isRowActive ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-ping" />
                            ) : (
                              <span className="w-1 h-1 rounded-full bg-slate-700" />
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
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono-tech text-slate-400">
            <span>PREDICTION ENGINE: ONLINE</span>
            <span className="text-cyan-400">M11_NODE_ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import {
  Send,
  Youtube,
  ShieldCheck,
  Clock,
  Users,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { PublicSettings } from '../services/auth'

interface PublicHUDProps {
  settings: PublicSettings
  visible: boolean
}

export const PublicHUD: React.FC<PublicHUDProps> = ({ settings, visible }) => {
  const [time, setTime] = useState('')
  const [onlineCount, setOnlineCount] = useState(settings.onlineCount)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Live 12h Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Dynamic user count fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineCount((prev) => {
        const delta = Math.floor(Math.random() * 5) - 2
        return Math.max(120, prev + delta)
      })
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  return (
    <>
      {/* Top HUD Bar with Smooth Slide-In Reveal */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 px-4 sm:px-8 py-4 flex items-center justify-between pointer-events-none transition-all duration-700 ease-out transform ${
          visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}
      >
        {/* Brand Lockup */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,242,254,0.25)]">
            <div className="absolute inset-0 rounded-xl border border-cyan-400/40 animate-pulse" />
            <span className="font-display font-bold text-cyan-300 text-lg">M</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold tracking-wider text-white text-base">
                MAGIC SCRIPT
              </span>
              <span className="text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                NEXUS 3D
              </span>
            </div>
            <p className="text-[11px] font-mono-tech text-slate-400 hidden sm:block">
              QUANTUM OPERATIONS TERMINAL
            </p>
          </div>
        </div>

        {/* Live Telemetry Pills & Fullscreen Control */}
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          {/* Fullscreen toggle */}
          <button
            onClick={handleToggleFullscreen}
            title="Toggle Fullscreen"
            className="glass-panel w-9 h-9 rounded-full hidden sm:flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:border-cyan-400/50 transition-all shadow-md"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Online count */}
          <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono-tech text-slate-300 border-slate-700/60 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Users className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
            <span className="text-white font-medium">{onlineCount}</span>
            <span className="text-slate-400 hidden sm:inline">Active</span>
          </div>

          {/* Clock */}
          <div className="glass-panel px-3 py-1.5 rounded-full hidden md:flex items-center gap-2 text-xs font-mono-tech text-slate-300 border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{time}</span>
          </div>
        </div>
      </header>

      {/* Bottom HUD Bar: Social Links & Security with Slide-Up Reveal */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-8 py-4 flex items-center justify-between pointer-events-none transition-all duration-700 ease-out transform ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono-tech text-slate-400 pointer-events-auto">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>END-TO-END ENCRYPTED GATEWAY</span>
        </div>

        {/* Social channels */}
        <div className="flex items-center gap-3 mx-auto sm:mx-0 pointer-events-auto">
          {settings.telegramUrl && (
            <a
              href={settings.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono-tech text-slate-300 hover:text-cyan-300 hover:border-cyan-400/50 hover:box-glow-cyan transition-all"
            >
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telegram VIP</span>
            </a>
          )}

          {settings.youtubeUrl && (
            <a
              href={settings.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono-tech text-slate-300 hover:text-violet-300 hover:border-violet-400/50 hover:box-glow-violet transition-all"
            >
              <Youtube className="w-3.5 h-3.5 text-red-400" />
              <span>YouTube</span>
            </a>
          )}
        </div>
      </footer>
    </>
  )
}

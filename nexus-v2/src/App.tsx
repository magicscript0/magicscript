import React, { useState, useEffect } from 'react'
import { ThreeCanvas } from './components/ThreeCanvas'
import { BootLoader } from './components/BootLoader'
import { PublicHUD } from './components/PublicHUD'
import { NexusLoginCard } from './components/NexusLoginCard'
import { GameConsoleView } from './components/GameConsoleView'
import {
  fetchPublicSettings,
  authenticateGameUser,
  DEFAULT_PUBLIC_SETTINGS,
  type PublicSettings,
} from './services/auth'

export const App: React.FC = () => {
  const [bootCompleted, setBootCompleted] = useState(false)
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_PUBLIC_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{
    accountId: string
    token: string
    expiresAt: string
  } | null>(() => {
    // Check if session exists in localStorage
    const saved = localStorage.getItem('nexus_session_v2')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (new Date(parsed.expiresAt).getTime() > Date.now()) {
          return parsed
        }
      } catch {
        localStorage.removeItem('nexus_session_v2')
      }
    }
    return null
  })

  // Load public settings from Supabase
  useEffect(() => {
    fetchPublicSettings().then((res) => {
      setSettings(res)
      document.title = `${res.title} · MAGIC SCRIPT NEXUS`
    })
  }, [])

  const handleLogin = async (accountId: string, code: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await authenticateGameUser(accountId, code)
      const newSession = {
        accountId: result.accountId,
        token: result.token,
        expiresAt: result.expiresAt,
      }
      localStorage.setItem('nexus_session_v2', JSON.stringify(newSession))
      setSession(newSession)
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify code.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('nexus_session_v2')
    setSession(null)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-slate-100 flex flex-col justify-center items-center select-none">
      {/* 1. Real 3D Three.js WebGL Engine Canvas */}
      <ThreeCanvas accelerate={!bootCompleted} />

      {/* 2. Cyber scanlines overlay for high-tech aesthetic */}
      <div className="fixed inset-0 scanlines-overlay opacity-30 pointer-events-none z-10" />

      {/* 3. Cinematic Startup Bootloader (Fake Loading Sequence) */}
      {!bootCompleted && (
        <BootLoader onComplete={() => setBootCompleted(true)} />
      )}

      {/* 4. Ambient Public HUD (Status, Live Clock, Online Users, Social Links) */}
      <PublicHUD settings={settings} />

      {/* 5. Main Center Stage */}
      <main className="relative z-20 flex items-center justify-center w-full py-16 px-4">
        {session ? (
          <GameConsoleView
            accountId={session.accountId}
            expiresAt={session.expiresAt}
            onLogout={handleLogout}
          />
        ) : (
          <NexusLoginCard
            settings={settings}
            onLogin={handleLogin}
            loading={loading}
            error={error}
          />
        )}
      </main>
    </div>
  )
}

export default App

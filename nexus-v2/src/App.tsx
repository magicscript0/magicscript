import React, { useState, useEffect, useCallback } from 'react'
import { ThreeCanvas } from './components/ThreeCanvas'
import { BootLoader } from './components/BootLoader'
import { PublicHUD } from './components/PublicHUD'
import { NexusLoginCard } from './components/NexusLoginCard'
import { GameConsoleView } from './components/GameConsoleView'
import { CyberErrorBoundary } from './components/CyberErrorBoundary'
import { useGameAccess } from './hooks/useGameAccess'
import { normalizeAccountId, GameAccessError } from './services/gameAccess'
import { recordGameLoginFailure, recordGameLoginSuccess } from './services/visitorTracking'
import {
  fetchPublicSettings,
  DEFAULT_PUBLIC_SETTINGS,
  type PublicSettings,
} from './services/auth'

export const App: React.FC = () => {
  const [bootState, setBootState] = useState<'booting' | 'ready'>('booting')
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_PUBLIC_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Real Supabase Access Engine from MAIN
  const access = useGameAccess()
  const authorized = access.status === 'active'

  // Fetch Public Settings from Supabase
  useEffect(() => {
    fetchPublicSettings().then((res) => {
      setSettings(res)
      document.title = `${res.title} · MAGIC SCRIPT NEXUS`
    })
  }, [])

  // Real Login Handler linked to Supabase RPC & Visitor Tracking
  const handleLogin = useCallback(
    async (accountId: string, code: string) => {
      setLoading(true)
      setError(null)
      try {
        const cleanId = normalizeAccountId(accountId)
        const cleanCode = code.trim().toUpperCase()
        await access.login(cleanId, cleanCode)
        recordGameLoginSuccess(cleanId)
      } catch (cause: unknown) {
        recordGameLoginFailure(accountId, cause)
        if (cause instanceof GameAccessError) {
          setError(cause.message)
        } else if (cause instanceof Error) {
          setError(cause.message)
        } else {
          setError('Access could not be verified right now. Try again shortly.')
        }
        throw cause
      } finally {
        setLoading(false)
      }
    },
    [access]
  )

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030712] text-slate-100 flex flex-col justify-center items-center select-none">
      {/* 1. Real 3D Three.js WebGL Engine Canvas (Runs at 60 FPS in background) */}
      <CyberErrorBoundary moduleName="3D KINETIC ENGINE">
        <ThreeCanvas accelerate={bootState === 'booting'} />
      </CyberErrorBoundary>

      {/* 2. Cyber scanlines overlay for authentic futuristic display */}
      <div className="fixed inset-0 scanlines-overlay opacity-25 pointer-events-none z-10" />

      {/* 3. Realistic Hardware Bootloader (Displays until 100% complete) */}
      {bootState === 'booting' && (
        <BootLoader onComplete={() => setBootState('ready')} />
      )}

      {/* 4. Ambient Public HUD - Only visible AFTER loading completely finishes */}
      <PublicHUD settings={settings} visible={bootState === 'ready'} />

      {/* 5. Main Center Stage - STRICTLY MOUNTED & REVEALED ONLY AFTER 100% BOOT COMPLETION */}
      {bootState === 'ready' && (
        <main className="relative z-20 flex items-center justify-center w-full py-16 px-4">
          <CyberErrorBoundary moduleName="COMMAND MATRIX">
            {authorized && access.accountId ? (
              <GameConsoleView
                accountId={access.accountId}
                remainingMs={access.remainingMs}
                onLogout={access.exit}
              />
            ) : (
              <NexusLoginCard
                settings={settings}
                onLogin={handleLogin}
                loading={loading || access.status === 'checking'}
                error={error}
              />
            )}
          </CyberErrorBoundary>
        </main>
      )}
    </div>
  )
}

export default App

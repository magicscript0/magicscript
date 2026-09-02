import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { AdminSidebar } from '../components/AdminSidebar'
import { AdminTopbar } from '../components/AdminTopbar'
import { InlineError } from '../components/AdminPrimitives'
import { SocialLinks } from '../components/SocialLinks'
import { ToastProvider } from '../components/ToastProvider'
import { useControlSettings } from '../hooks/useControlSettings'
import type { PageRoute } from '../hooks/usePageRoute'
import type { AdminProfile } from '../types/supabase'

export interface AdminLayoutProps {
  admin: AdminProfile
  route: PageRoute
  onNavigate: (route: PageRoute) => void
  onLogout: () => void
  sessionError?: string | null
  children: ReactNode
}

export function AdminLayout({ admin, route, onNavigate, onLogout, sessionError = null, children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { settings, setSettings, loading: settingsLoading, available: settingsAvailable, error: settingsError, reload } = useControlSettings()
  const displayName = admin.username || admin.email.split('@')[0]

  const sharedSettings = {
    settings,
    setSettings,
    loading: settingsLoading,
    available: settingsAvailable,
    error: settingsError,
    reload,
  }

  return (
    <ToastProvider>
      <SettingsContext.Provider value={sharedSettings}>
        <div className="min-h-screen lg:pl-[272px]">
          <AdminSidebar
            role={admin.role}
            route={route}
            open={sidebarOpen}
            username={displayName}
            onNavigate={onNavigate}
            onLogout={onLogout}
            onClose={() => setSidebarOpen(false)}
          />
          <AdminTopbar admin={admin} route={route} announcement={settings.general.announcement} onOpenMenu={() => setSidebarOpen(true)} />
          {(sessionError || settingsError) && <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-4 pt-4 sm:px-7 sm:pt-6 lg:px-9">
            {sessionError && <InlineError message={sessionError} onRetry={onLogout} />}
            {settingsError && <InlineError message={settingsError} onRetry={() => { void reload() }} />}
          </div>}
          <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9 lg:py-8">
            <div className="page-enter">{children}</div>
          </main>
          <footer className="border-t border-white/[.06] px-4 py-5 sm:px-9">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p><span className="font-semibold text-slate-500">MAGIC SCRIPT</span> · Control center for game visualization operations.</p>
              <SocialLinks links={settings.social} compact />
            </div>
          </footer>
        </div>
      </SettingsContext.Provider>
    </ToastProvider>
  )
}

// Pages consume this shared value so every route uses the same settings fetch.
import type { ControlSettings } from '../types/supabase'

interface SettingsContextValue {
  settings: ControlSettings
  setSettings: Dispatch<SetStateAction<ControlSettings>>
  loading: boolean
  available: boolean
  error: string | null
  reload: () => Promise<void>
}
const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSharedControlSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSharedControlSettings must be used inside AdminLayout')
  return value
}

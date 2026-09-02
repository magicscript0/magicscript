import { useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingScreen } from './components/LoadingScreen'
import { useAdminSession } from './hooks/useAdminSession'
import { usePageRoute } from './hooks/usePageRoute'
import { AdminLayout, useSharedControlSettings } from './layouts/AdminLayout'
import { ActivityLogsPage } from './pages/ActivityLogsPage'
import { AdminCodesPage } from './pages/AdminCodesPage'
import { Console } from './pages/Console'
import { DashboardPage } from './pages/DashboardPage'
import { DisplaySettingsPage } from './pages/DisplaySettingsPage'
import { GeneralSettingsPage } from './pages/GeneralSettingsPage'
import { Login } from './pages/Login'
import { NotAuthorizedPage } from './pages/NotAuthorizedPage'
import { ProfilePage } from './pages/ProfilePage'
import { RoundHistoryPage } from './pages/RoundHistoryPage'
import { SocialLinksPage } from './pages/SocialLinksPage'
import { can } from './utils/permissions'
import type { PageRoute } from './hooks/usePageRoute'
import type { Permission } from './utils/permissions'

const ROUTE_PERMISSIONS: Record<PageRoute, Permission> = {
  dashboard: 'dashboard.view',
  game: 'game.use',
  history: 'history.view',
  codes: 'codes.manage',
  logs: 'logs.view',
  social: 'social.manage',
  display: 'display.manage',
  general: 'general.manage',
  profile: 'profile.view',
}

function Workspace({ admin, route, navigate, onLogout }: { admin: NonNullable<ReturnType<typeof useAdminSession>['admin']>; route: PageRoute; navigate: (route: PageRoute) => void; onLogout: () => void }) {
  return <AdminLayout admin={admin} route={route} onNavigate={navigate} onLogout={onLogout}><WorkspacePage admin={admin} route={route} onLogout={onLogout} /></AdminLayout>
}

function WorkspacePage({ admin, route, onLogout }: { admin: NonNullable<ReturnType<typeof useAdminSession>['admin']>; route: PageRoute; onLogout: () => void }) {
  const { settings } = useSharedControlSettings()
  useEffect(() => {
    document.title = settings.general.browserTitle || 'MAGIC SCRIPT Admin Console'
  }, [settings.general.browserTitle])

  if (!can(admin.role, ROUTE_PERMISSIONS[route])) return <NotAuthorizedPage />
  if (route === 'dashboard') return <DashboardPage adminId={admin.id} />
  if (route === 'game') return <Console operatorId={admin.username || admin.email} adminId={admin.id} displaySettings={settings.display} onLogout={onLogout} embedded />
  if (route === 'history') return <RoundHistoryPage />
  if (route === 'codes') return <AdminCodesPage admin={admin} />
  if (route === 'logs') return <ActivityLogsPage />
  if (route === 'social') return <SocialLinksPage admin={admin} />
  if (route === 'display') return <DisplaySettingsPage admin={admin} />
  if (route === 'general') return <GeneralSettingsPage admin={admin} />
  return <ProfilePage admin={admin} />
}

export default function App() {
  const session = useAdminSession()
  const { route, navigate } = usePageRoute()
  if (session.loading) return <LoadingScreen />
  return <ErrorBoundary>{session.admin ? <Workspace admin={session.admin} route={route} navigate={navigate} onLogout={() => { void session.logout() }} /> : <Login onAuthenticate={session.login} />}</ErrorBoundary>
}

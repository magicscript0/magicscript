import { useCallback, useEffect } from 'react'
import { BrandMark } from './components/BrandMark'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingScreen } from './components/LoadingScreen'
import { useAdminSession } from './hooks/useAdminSession'
import { useGameAccess } from './hooks/useGameAccess'
import { usePageRoute } from './hooks/usePageRoute'
import { isAppPath, usePathRoute } from './hooks/usePathRoute'
import { AdminLayout, useSharedControlSettings } from './layouts/AdminLayout'
import { ActivityLogsPage } from './pages/ActivityLogsPage'
import { AdminCodesPage } from './pages/AdminCodesPage'
import { Console } from './pages/Console'
import { DashboardPage } from './pages/DashboardPage'
import { DisplaySettingsPage } from './pages/DisplaySettingsPage'
import { Fortune } from './pages/Fortune'
import { GameAccessPage } from './pages/GameAccessPage'
import { GameLogin } from './pages/GameLogin'
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
  access: 'access.manage',
  logs: 'logs.view',
  social: 'social.manage',
  display: 'display.manage',
  general: 'general.manage',
  profile: 'profile.view',
}

/** Workspace sections reachable through the legacy `/#/section` bookmarks. */
const ADMIN_HASH_ROUTES: readonly PageRoute[] = [
  'dashboard', 'game', 'history', 'codes', 'access', 'logs', 'social', 'display', 'general', 'profile',
]

function Workspace({ admin, route, navigate, onLogout, sessionError }: { admin: NonNullable<ReturnType<typeof useAdminSession>['admin']>; route: PageRoute; navigate: (route: PageRoute) => void; onLogout: () => void; sessionError: string | null }) {
  return <AdminLayout admin={admin} route={route} onNavigate={navigate} onLogout={onLogout} sessionError={sessionError}><WorkspacePage admin={admin} route={route} onLogout={onLogout} /></AdminLayout>
}

function WorkspacePage({ admin, route, onLogout }: { admin: NonNullable<ReturnType<typeof useAdminSession>['admin']>; route: PageRoute; onLogout: () => void }) {
  const { settings } = useSharedControlSettings()
  useEffect(() => {
    document.title = settings.general.browserTitle || 'MAGIC SCRIPT Admin Console'
  }, [settings.general.browserTitle])

  if (!can(admin.role, ROUTE_PERMISSIONS[route])) return <NotAuthorizedPage role={admin.role} />
  if (route === 'dashboard') return <DashboardPage adminId={admin.id} adminRole={admin.role} />
  if (route === 'game') return <Console operatorId={admin.username || admin.email} adminId={admin.id} displaySettings={settings.display} onLogout={onLogout} embedded />
  if (route === 'history') return <RoundHistoryPage />
  if (route === 'codes') return <AdminCodesPage admin={admin} />
  if (route === 'access') return <GameAccessPage admin={admin} />
  if (route === 'logs') return <ActivityLogsPage />
  if (route === 'social') return <SocialLinksPage admin={admin} />
  if (route === 'display') return <DisplaySettingsPage admin={admin} />
  if (route === 'general') return <GeneralSettingsPage admin={admin} />
  return <ProfilePage admin={admin} />
}

/* ------------------------------------------------------------------ */
/* Admin area — Supabase Auth, exactly the existing control plane.    */
/* ------------------------------------------------------------------ */

function AdminArea({ initialPath }: { initialPath: '/admin' | '/login/admin' }) {
  const session = useAdminSession()
  const { navigate, replace } = usePathRoute()

  // Signed-in admins land on the dashboard; anonymous visitors at /admin are
  // redirected to the admin login route (never to the game experience).
  // A `#/section` hash survives both hops so deep links keep their target.
  useEffect(() => {
    if (session.loading) return
    if (session.admin && initialPath === '/login/admin') navigate('/admin', { preserveHash: true })
    if (!session.admin && initialPath === '/admin') replace('/login/admin', { preserveHash: true })
  }, [session.loading, session.admin, initialPath, navigate, replace])

  if (session.loading) return <LoadingScreen />
  if (!session.admin) return <Login onAuthenticate={session.login} statusMessage={session.error} />
  return <AdminWorkspace admin={session.admin} onLogout={() => { void session.logout() }} sessionError={session.error} />
}

function AdminWorkspace({ admin, onLogout, sessionError }: { admin: NonNullable<ReturnType<typeof useAdminSession>['admin']>; onLogout: () => void; sessionError: string | null }) {
  const { route, navigate } = usePageRoute()
  return <Workspace admin={admin} route={route} navigate={navigate} onLogout={onLogout} sessionError={sessionError} />
}

/* ------------------------------------------------------------------ */
/* Game area — Apple of Fortune for end users.                        */
/* ------------------------------------------------------------------ */

function GameLoading() {
  return <main className="flex min-h-screen items-center justify-center px-5">
    <div className="flex flex-col items-center gap-4 text-center">
      <BrandMark />
      <div>
        <p className="text-sm font-semibold tracking-[.18em] text-slate-100">Apple of Fortune</p>
        <p className="mt-1 text-xs text-slate-500">Checking your access…</p>
      </div>
    </div>
  </main>
}

function GameArea({ path }: { path: '/' | '/play' }) {
  const access = useGameAccess()
  const { replace, navigate } = usePathRoute()
  const authorized = access.status === 'active'

  // The console route is unreachable without a server-validated session:
  // missing, expired, revoked, or still-checking sessions all land on the
  // Game Login screen and the URL is canonicalized back to `/`.
  useEffect(() => {
    if (path === '/play' && access.status !== 'checking' && !authorized) replace('/')
  }, [path, access.status, authorized, replace])

  /** Successful redemption at the login screen opens the game console. */
  const handleLogin = useCallback(
    async (accountId: string, code: string) => {
      await access.login(accountId, code)
      navigate('/play')
    },
    [access, navigate],
  )

  if (path === '/play') {
    if (access.status === 'checking') return <GameLoading />
    if (authorized && access.accountId !== null) {
      return <Fortune accountId={access.accountId} remainingMs={access.remainingMs} onExit={access.exit} />
    }
    // Brief fall-through while the URL redirect above settles.
  }
  return <GameLogin onLogin={handleLogin} endReason={access.reason} />
}

/* ------------------------------------------------------------------ */
/* Root — product split between the game experience and the admin.    */
/* ------------------------------------------------------------------ */

function Root() {
  const { path, replace } = usePathRoute()

  // Legacy admin bookmarks (e.g. "/#/dashboard") keep working: they move to
  // the admin area while preserving their hash section.
  useEffect(() => {
    if (path !== '/') return
    const hash = window.location.hash.replace(/^#\/?/, '')
    if (hash !== '' && (ADMIN_HASH_ROUTES as readonly string[]).includes(hash)) replace('/admin', { preserveHash: true })
  }, [path, replace])

  // Unknown paths canonicalize to the Game Login.
  useEffect(() => {
    if (!isAppPath(path)) replace('/')
  }, [path, replace])

  if (path === '/admin' || path === '/login/admin') return <AdminArea initialPath={path} />
  if (path === '/play') return <GameArea path="/play" />
  return <GameArea path="/" />
}

export default function App() {
  return <ErrorBoundary><Root /></ErrorBoundary>
}

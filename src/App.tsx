import { useCallback, useEffect, useState } from 'react'
import { CyberBackdrop } from './components/CyberBackdrop'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GameIntro, hasGameIntroCompleted } from './components/GameIntro'
import { LoadingScreen } from './components/LoadingScreen'
import { VisitorTracker } from './components/VisitorTracker'
import { useAdminSession } from './hooks/useAdminSession'
import { useGameAccess } from './hooks/useGameAccess'
import { usePageRoute } from './hooks/usePageRoute'
import { usePublicGameSettings } from './hooks/usePublicGameSettings'
import { isAppPath, usePathRoute } from './hooks/usePathRoute'
import { AdminLayout, useSharedControlSettings } from './layouts/AdminLayout'
import { ActivityLogsPage } from './pages/ActivityLogsPage'
import { AdminCodesPage } from './pages/AdminCodesPage'
import { AuthActivityPage } from './pages/AuthActivityPage'
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
import { PublicGamePage } from './pages/PublicGamePage'
import { RoundHistoryPage } from './pages/RoundHistoryPage'
import { SecurityAlertsPage } from './pages/SecurityAlertsPage'
import { SocialLinksPage } from './pages/SocialLinksPage'
import { VisitorsPage } from './pages/VisitorsPage'
import { recordGameLoginFailure, recordGameLoginSuccess } from './services/visitorTracking'
import { can } from './utils/permissions'
import type { PageRoute } from './hooks/usePageRoute'
import type { Permission } from './utils/permissions'

const ROUTE_PERMISSIONS: Record<PageRoute, Permission> = {
  dashboard: 'dashboard.view',
  public: 'display.manage',
  game: 'game.use',
  history: 'history.view',
  codes: 'codes.manage',
  access: 'access.manage',
  logs: 'logs.view',
  visitors: 'security.view',
  auth: 'security.view',
  alerts: 'security.view',
  social: 'social.manage',
  display: 'display.manage',
  general: 'general.manage',
  profile: 'profile.view',
}

/** Workspace sections reachable through the legacy `/#/section` bookmarks. */
const ADMIN_HASH_ROUTES: readonly PageRoute[] = [
  'dashboard', 'public', 'game', 'history', 'codes', 'access', 'logs', 'visitors', 'auth', 'alerts', 'social', 'display', 'general', 'profile',
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
  if (route === 'public') return <PublicGamePage admin={admin} />
  if (route === 'game') return <Console operatorId={admin.username || admin.email} adminId={admin.id} displaySettings={settings.display} onLogout={onLogout} embedded />
  if (route === 'history') return <RoundHistoryPage />
  if (route === 'codes') return <AdminCodesPage admin={admin} />
  if (route === 'access') return <GameAccessPage admin={admin} />
  if (route === 'logs') return <ActivityLogsPage />
  if (route === 'visitors') return <VisitorsPage />
  if (route === 'auth') return <AuthActivityPage />
  if (route === 'alerts') return <SecurityAlertsPage admin={admin} />
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

  // Supabase is the single source of truth. An authorized session moves the
  // browser to /admin; anything else canonicalizes to /login/admin. Both hops
  // preserve a `#/section` hash so admin deep links keep their target.
  useEffect(() => {
    if (session.loading) return
    if (session.admin && initialPath === '/login/admin') navigate('/admin', { preserveHash: true })
    if (!session.admin && initialPath === '/admin') replace('/login/admin', { preserveHash: true })
  }, [session.loading, session.admin, initialPath, navigate, replace])

  // Never render the dashboard (or the login form) while authorization is
  // still being verified — that is what prevents an unauthorized flash.
  if (session.loading) return <LoadingScreen />

  // Without an authorized profile only the sign-in screen is ever rendered —
  // the dashboard tree is never mounted, whichever admin URL was requested.
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

/** Boot-curtain lifecycle for the public flow (presentation only). */
type GameBootPhase = 'playing' | 'dissolving' | 'done'

function GameArea({ path }: { path: '/' | '/play' }) {
  const access = useGameAccess()
  const settings = usePublicGameSettings()
  const { replace, navigate } = usePathRoute()
  const authorized = access.status === 'active'
  /**
   * The premium loading screen curtains the login until its sequence has
   * played. It runs once per page load (never again after a sign-out), stays
   * above the login rather than replacing it, and hands over while the login
   * fades in underneath — no access, session, or routing behaviour is
   * involved, so every check below still runs exactly as before.
   */
  const [boot, setBoot] = useState<GameBootPhase>(() => (hasGameIntroCompleted() ? 'done' : 'playing'))

  // The curtain is cosmetic, so it must never be able to trap the login
  // behind it: if the boot sequence is interrupted for any reason, the login
  // is revealed regardless.
  useEffect(() => {
    if (boot === 'done') return
    const id = window.setTimeout(() => { setBoot('done') }, 6_000)
    return () => window.clearTimeout(id)
  }, [boot])

  // The console route is unreachable without a server-validated session:
  // missing, expired, revoked, or still-checking sessions all land on the
  // Game Login screen and the URL is canonicalized back to `/`.
  useEffect(() => {
    if (path === '/play' && access.status !== 'checking' && !authorized) replace('/')
  }, [path, access.status, authorized, replace])

  /** Successful redemption at the login screen opens the game console. */
  const handleLogin = useCallback(
    async (accountId: string, code: string) => {
      try {
        await access.login(accountId, code)
      } catch (cause) {
        // Fail-safe monitoring: records the ATTEMPT and its error CATEGORY
        // only — never the submitted access code — then rethrows unchanged
        // so the login screen keeps its exact existing error behaviour.
        recordGameLoginFailure(accountId, cause)
        throw cause
      }
      recordGameLoginSuccess(accountId)
      navigate('/play')
    },
    [access, navigate],
  )

  if (path === '/play') {
    // Same gate as before, now wearing the boot screen's identity and the same
    // ambient shell, so reloading /play never shows an unstyled frame.
    if (access.status === 'checking') {
      return (
        <div className="pg-flow">
          <CyberBackdrop />
          <GameIntro mode="checking" />
        </div>
      )
    }
    if (authorized && access.accountId !== null) {
      return <Fortune accountId={access.accountId} remainingMs={access.remainingMs} onExit={access.exit} displaySettings={settings.display} />
    }
    // Brief fall-through while the URL redirect above settles.
  }
  return (
    <div className="pg-flow">
      <CyberBackdrop />
      {boot !== 'done' ? <GameIntro onReveal={() => setBoot('dissolving')} onFinish={() => setBoot('done')} /> : null}
      <div className={`pg-veil${boot === 'playing' ? '' : ' pg-veil--open'}`}>
        <GameLogin onLogin={handleLogin} endReason={access.reason} ambient={false} settings={settings} />
      </div>
    </div>
  )
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
  // The VisitorTracker observes routing milestones for the monitoring
  // center (session start, key page views, throttled heartbeat). It renders
  // nothing, writes only to Supabase, and is fail-safe by contract — it can
  // never block or alter the flows it observes.
  return <ErrorBoundary><VisitorTracker /><Root /></ErrorBoundary>
}

import { useCallback, useEffect, useState } from 'react'

/**
 * Top-level product routing (pathname based).
 *
 *   /            → Apple of Fortune game login (default experience)
 *   /play        → Apple of Fortune game console (guarded game session)
 *   /login/admin → administrator sign-in (Supabase Auth)
 *   /admin       → administrator dashboard (workspace sections keep the
 *                  existing hash-based routing underneath)
 */
export type AppPath = '/' | '/play' | '/login/admin' | '/admin'

export const APP_PATHS: readonly AppPath[] = ['/', '/play', '/login/admin', '/admin']

export function readCurrentPath(): string {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '' ? '/' : path
}

export function isAppPath(path: string): path is AppPath {
  return (APP_PATHS as readonly string[]).includes(path)
}

export function usePathRoute() {
  const [path, setPath] = useState<string>(() => readCurrentPath())

  useEffect(() => {
    const onPopState = () => setPath(readCurrentPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: AppPath, options?: { preserveHash?: boolean }) => {
    const hash = options?.preserveHash ? window.location.hash : ''
    if (readCurrentPath() !== to) window.history.pushState(null, '', to + hash)
    setPath(to)
  }, [])

  const replace = useCallback((to: AppPath, options?: { preserveHash?: boolean }) => {
    const hash = options?.preserveHash ? window.location.hash : ''
    window.history.replaceState(null, '', to + hash)
    setPath(to)
  }, [])

  return { path, navigate, replace }
}

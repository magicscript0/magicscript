import { useCallback, useEffect, useState } from 'react'

/**
 * Top-level product routing (pathname based).
 *
 *   /            → Apple of Fortune game login (default experience)
 *   /play        → Apple of Fortune game console (guarded game session)
 *   /login/admin → administrator sign-in (Supabase Auth)
 *   /admin       → administrator dashboard (workspace sections keep the
 *                  existing hash-based routing underneath)
 *
 * The current path lives in a single module-level store. Every component that
 * calls `usePathRoute` reads and writes that one value, so a `navigate` issued
 * deep in the tree (for example the admin area after a successful sign-in)
 * re-renders the root router instead of leaving it on a stale path. Per-hook
 * `useState` copies used to desynchronise here, which left the URL and the
 * rendered screen disagreeing after login and after browser history moves.
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

type Listener = () => void

const listeners = new Set<Listener>()
let currentPath: string | null = null

/**
 * The browser URL always wins on read: a hard navigation, a test harness, or
 * any code that touched `history` directly must never be shadowed by a stale
 * cached value. The cache only exists so every hook instance shares one
 * identity and re-renders together.
 */
function store(): string {
  const actual = readCurrentPath()
  if (currentPath !== actual) currentPath = actual
  return currentPath
}

function publish(path: string): void {
  if (currentPath === path) return
  currentPath = path
  for (const listener of [...listeners]) listener()
}

/** Re-read the browser URL, e.g. after a history popstate. */
function syncFromLocation(): void {
  publish(readCurrentPath())
}

/** Test helper: drop the cached path so a fresh `window.location` is read. */
export function resetPathRouteStore(): void {
  currentPath = null
}

function withHash(to: AppPath, preserveHash: boolean | undefined): string {
  return to + (preserveHash ? window.location.hash : '')
}

export function usePathRoute() {
  const [path, setPath] = useState<string>(() => store())

  useEffect(() => {
    const listener = () => setPath(store())
    listeners.add(listener)
    window.addEventListener('popstate', syncFromLocation)
    // The URL may have changed between render and subscription.
    listener()
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) window.removeEventListener('popstate', syncFromLocation)
    }
  }, [])

  const navigate = useCallback((to: AppPath, options?: { preserveHash?: boolean }) => {
    if (readCurrentPath() !== to) window.history.pushState(null, '', withHash(to, options?.preserveHash))
    publish(to)
  }, [])

  const replace = useCallback((to: AppPath, options?: { preserveHash?: boolean }) => {
    window.history.replaceState(null, '', withHash(to, options?.preserveHash))
    publish(to)
  }, [])

  return { path, navigate, replace }
}

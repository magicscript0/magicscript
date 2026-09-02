import { useCallback, useEffect, useState } from 'react'

export type PageRoute =
  | 'dashboard'
  | 'game'
  | 'history'
  | 'codes'
  | 'access'
  | 'logs'
  | 'social'
  | 'display'
  | 'general'
  | 'profile'

const VALID_ROUTES: readonly PageRoute[] = [
  'dashboard',
  'game',
  'history',
  'codes',
  'access',
  'logs',
  'social',
  'display',
  'general',
  'profile',
]

function readRoute(): PageRoute {
  const value = window.location.hash.replace(/^#\/?/, '') as PageRoute
  return VALID_ROUTES.includes(value) ? value : 'dashboard'
}

export function usePageRoute() {
  const [route, setRoute] = useState<PageRoute>(() => readRoute())

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = useCallback((next: PageRoute) => {
    window.location.hash = next
    setRoute(next)
  }, [])

  return { route, navigate }
}

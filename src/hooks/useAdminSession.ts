import { useCallback, useEffect, useState } from 'react'
import {
  getCurrentAdmin,
  friendlyControlError,
  isControlSystemConfigured,
  signInAdmin,
  signOutAdmin,
  subscribeToAuthChanges,
} from '../services/supabase'
import type { AdminProfile } from '../types/supabase'

export interface AdminSessionState {
  admin: AdminProfile | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<AdminProfile>
  logout: () => Promise<void>
}

export function useAdminSession(): AdminSessionState {
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let refreshSequence = 0

    if (!isControlSystemConfigured()) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the site.')
      setLoading(false)
      return () => { mounted = false }
    }

    const refreshAdmin = () => {
      const sequence = ++refreshSequence
      void getCurrentAdmin()
        .then((profile) => {
          if (mounted && sequence === refreshSequence) {
            setAdmin(profile)
            setError(null)
          }
        })
        .catch((cause) => {
          if (mounted && sequence === refreshSequence) {
            setAdmin(null)
            setError(friendlyControlError(cause, 'The authenticated workspace could not be loaded.'))
          }
        })
        .finally(() => {
          if (mounted && sequence === refreshSequence) setLoading(false)
        })
    }

    const unsubscribe = subscribeToAuthChanges((session) => {
      if (!session) {
        // Do not clear an actionable profile/RLS error after getCurrentAdmin
        // signs out an unauthorized Auth session. A deliberate logout clears
        // the message in logout() instead.
        if (mounted) {
          setAdmin(null)
          setLoading(false)
        }
        return
      }

      // Supabase advises deferring work from inside onAuthStateChange so an
      // Auth callback never calls another Auth API while the lock is held.
      window.setTimeout(() => {
        if (mounted) refreshAdmin()
      }, 0)
    })

    refreshAdmin()

    return () => {
      mounted = false
      refreshSequence += 1
      unsubscribe?.()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      const profile = await signInAdmin(email, password)
      setAdmin(profile)
      return profile
    } catch (cause) {
      const message = friendlyControlError(cause, 'Supabase authentication could not be completed.')
      setError(message)
      if (cause instanceof Error) throw cause
      throw new Error(message)
    }
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await signOutAdmin()
      setAdmin(null)
    } catch (cause) {
      setError(friendlyControlError(cause, 'The Supabase session could not be closed.'))
    }
  }, [])

  return { admin, loading, error, login, logout }
}

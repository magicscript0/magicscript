import { useCallback, useEffect, useState } from 'react'
import {
  getCurrentAdmin,
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
    const unsubscribe = subscribeToAuthChanges((session) => {
      if (!session) {
        if (mounted) {
          setAdmin(null)
          setLoading(false)
        }
        return
      }
      void getCurrentAdmin()
        .then((profile) => {
          if (mounted) setAdmin(profile)
        })
        .catch(() => {
          if (mounted) setAdmin(null)
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    })

    void getCurrentAdmin()
      .then((profile) => {
        if (mounted) setAdmin(profile)
      })
      .catch(() => {
        if (mounted) setAdmin(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
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
      const message = cause instanceof Error ? cause.message : 'Sign in could not be completed.'
      setError(message)
      throw cause
    }
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await signOutAdmin()
      setAdmin(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The session could not be closed.')
    }
  }, [])

  return { admin, loading, error, login, logout }
}

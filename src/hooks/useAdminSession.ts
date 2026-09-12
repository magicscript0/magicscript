import { useCallback, useEffect, useState } from 'react'
import {
  getCurrentAdmin,
  isControlSystemConfigured,
  signInAdmin,
  signOutAdmin,
  subscribeToAuthChanges,
} from '../services/supabase'
import { adminErrorMessage } from '../i18n/dashboard'
import { recordAdminLoginFailure, recordAdminLoginSuccess, recordAdminLogout } from '../services/visitorTracking'
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
      setError('نظام التحكم غير مُهيأ بعد. راجع إعدادات النظام ثم أعد بناء الموقع.')
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
            setError(adminErrorMessage(cause, 'تعذر تحميل مساحة العمل. حاول مرة أخرى.'))
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
      // Security monitoring (fire-and-forget, fail-safe): records the
      // outcome only. The email and password never reach the tracker.
      recordAdminLoginSuccess(profile.id)
      setAdmin(profile)
      return profile
    } catch (cause) {
      // Only the classified error KIND is recorded — never credentials.
      recordAdminLoginFailure(cause)
      const message = adminErrorMessage(cause, 'تعذر إتمام عملية تسجيل الدخول. حاول مرة أخرى.')
      setError(message)
      if (cause instanceof Error) throw cause
      throw new Error(message)
    }
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await signOutAdmin()
      recordAdminLogout()
      setAdmin(null)
    } catch (cause) {
      setError(adminErrorMessage(cause, 'تعذر إغلاق جلسة الدخول. حاول مرة أخرى.'))
    }
  }, [])

  return { admin, loading, error, login, logout }
}

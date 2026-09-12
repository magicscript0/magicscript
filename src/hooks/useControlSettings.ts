import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_CONTROL_SETTINGS, loadControlSettings } from '../services/control'
import { adminErrorMessage } from '../i18n/dashboard'
import type { ControlSettings } from '../types/supabase'

export function useControlSettings() {
  const [settings, setSettings] = useState<ControlSettings>(DEFAULT_CONTROL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadControlSettings()
      setSettings(next)
      setAvailable(true)
      setError(null)
    } catch (cause) {
      setAvailable(false)
      setError(adminErrorMessage(cause, 'تعذر تحميل بيانات التحكم. حاول مرة أخرى.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { settings, setSettings, loading, available, error, reload }
}

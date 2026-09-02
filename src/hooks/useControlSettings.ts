import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_CONTROL_SETTINGS, loadControlSettings } from '../services/control'
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
    } catch {
      setAvailable(false)
      setError('Control system temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { settings, setSettings, loading, available, error, reload }
}

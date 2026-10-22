import { useEffect, useState } from 'react'
import { DEFAULT_CONTROL_SETTINGS, loadPublicGameSettings } from '../services/control'
import type { ControlSettings } from '../types/supabase'

/**
 * Public-facing settings for the game login/game experience.
 *
 * Reads the same Supabase settings tables as the admin loader, but through the
 * anonymous (read-only) client and only the public columns. On any failure it
 * silently falls back to safe defaults so the public flow always renders —
 * offline included. One fetch per page load; no polling, no subscriptions.
 */
export function usePublicGameSettings(): ControlSettings {
  const [settings, setSettings] = useState<ControlSettings>(DEFAULT_CONTROL_SETTINGS)

  useEffect(() => {
    let mounted = true
    void loadPublicGameSettings().then((next) => {
      if (mounted) setSettings(next)
    })
    return () => {
      mounted = false
    }
  }, [])

  return settings
}

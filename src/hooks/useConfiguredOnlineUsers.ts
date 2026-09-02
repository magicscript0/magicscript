import { useEffect, useState } from 'react'
import type { DisplaySettings } from '../types/supabase'
import { getRandomInt } from '../utils/random'

function clampSettings(settings: DisplaySettings): DisplaySettings {
  const min = Math.max(0, Math.round(settings.onlineCountMin))
  const max = Math.max(min, Math.round(settings.onlineCountMax))
  return { ...settings, onlineCountMin: min, onlineCountMax: max }
}

export function useConfiguredOnlineUsers(settings: DisplaySettings): number | null {
  const normalized = clampSettings(settings)
  const initial = normalized.onlineCountMode === 'fixed'
    ? normalized.onlineCountFixed ?? normalized.onlineCountMin
    : getRandomInt(normalized.onlineCountMin, normalized.onlineCountMax)
  const [count, setCount] = useState<number | null>(normalized.onlineCountEnabled ? initial : null)

  useEffect(() => {
    const current = clampSettings(settings)
    if (!current.onlineCountEnabled) {
      setCount(null)
      return
    }
    const next = () => setCount(
      current.onlineCountMode === 'fixed'
        ? current.onlineCountFixed ?? current.onlineCountMin
        : getRandomInt(current.onlineCountMin, current.onlineCountMax),
    )
    next()
    const id = current.onlineCountMode === 'random'
      ? window.setInterval(next, current.onlineCountRefreshMs)
      : undefined
    return () => {
      if (id !== undefined) window.clearInterval(id)
    }
  }, [settings])

  return count
}

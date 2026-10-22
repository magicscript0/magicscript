import { useEffect, useState } from 'react'
import type { DisplaySettings } from '../types/supabase'
import { getRandomInt } from '../utils/random'

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Normalizes a possibly inverted/negative config so it always renders sanely. */
export function normalizeOnlineRange(settings: DisplaySettings): DisplaySettings {
  const min = Math.max(0, Math.round(settings.onlineCountMin))
  const max = Math.max(min, Math.round(settings.onlineCountMax))
  return { ...settings, onlineCountMin: min, onlineCountMax: max }
}

/**
 * One natural step for the demo activity counter.
 *
 * Instead of jumping to an unrelated value every tick, the counter performs a
 * bounded random walk: a small delta (scaled to the configured range), pulled
 * back toward the middle when it reaches an edge. The result is a number that
 * drifts plausibly and ALWAYS stays within [min, max].
 */
export function nextOnlineCount(current: number, min: number, max: number): number {
  if (min >= max) return min
  const span = max - min
  const maxStep = Math.max(1, Math.round(span * 0.08))
  const delta = getRandomInt(-maxStep, maxStep)
  let next = clamp(min, max, current + delta)
  if (next === min || next === max) {
    const midpoint = Math.round((min + max) / 2)
    next = clamp(min, max, current + Math.sign(midpoint - current) * getRandomInt(1, maxStep))
  }
  return next
}

/**
 * Admin-controlled "live activity" counter — a DEMO/ESTIMATED presentation
 * value, not a real measurement of authenticated users.
 *
 * - disabled → null (the chip is hidden)
 * - fixed → the configured fixed value
 * - random → a random start within [min, max], then a bounded random walk on
 *   the configured refresh cadence
 *
 * No Firebase listener, no presence system, no per-viewer polling.
 */
export function useConfiguredOnlineUsers(settings: DisplaySettings): number | null {
  const normalized = normalizeOnlineRange(settings)
  const initial = normalized.onlineCountMode === 'fixed'
    ? normalized.onlineCountFixed ?? normalized.onlineCountMin
    : getRandomInt(normalized.onlineCountMin, normalized.onlineCountMax)
  const [count, setCount] = useState<number | null>(normalized.onlineCountEnabled ? initial : null)

  useEffect(() => {
    const current = normalizeOnlineRange(settings)
    if (!current.onlineCountEnabled) {
      setCount(null)
      return
    }

    let value = current.onlineCountMode === 'fixed'
      ? current.onlineCountFixed ?? current.onlineCountMin
      : getRandomInt(current.onlineCountMin, current.onlineCountMax)
    setCount(value)

    if (current.onlineCountMode !== 'random') return

    const id = window.setInterval(() => {
      value = nextOnlineCount(value, current.onlineCountMin, current.onlineCountMax)
      setCount(value)
    }, current.onlineCountRefreshMs)
    return () => window.clearInterval(id)
  }, [settings])

  return count
}

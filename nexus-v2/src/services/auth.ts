import { getSupabaseClient } from './supabase'
import { loadPublicGameSettings, DEFAULT_CONTROL_SETTINGS } from './control'
import { redeemGameAccess } from './gameAccess'
import type { ControlSettings } from '../types/supabase'

export interface PublicSettings {
  siteName: string
  title: string
  caption: string
  telegramUrl: string
  youtubeUrl: string
  onlineCount: number
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  siteName: 'MAGIC SCRIPT',
  title: 'Apple of Fortune',
  caption: 'Enter your Account ID and Access Code to activate session.',
  telegramUrl: 'https://t.me/fox_script_vip',
  youtubeUrl: 'https://youtube.com/@nano_scriptt',
  onlineCount: 284,
}

export async function authenticateGameUser(accountId: string, accessCode: string) {
  return redeemGameAccess(accountId, accessCode)
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  try {
    const control = await loadPublicGameSettings()
    return {
      siteName: control.general.siteName || DEFAULT_PUBLIC_SETTINGS.siteName,
      title: control.login.title || DEFAULT_PUBLIC_SETTINGS.title,
      caption: control.login.caption || DEFAULT_PUBLIC_SETTINGS.caption,
      telegramUrl: control.social.telegramUrl || DEFAULT_PUBLIC_SETTINGS.telegramUrl,
      youtubeUrl: control.social.youtubeUrl || DEFAULT_PUBLIC_SETTINGS.youtubeUrl,
      onlineCount: control.display.onlineCountFixed || 284,
    }
  } catch {
    return DEFAULT_PUBLIC_SETTINGS
  }
}

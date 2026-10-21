import { getSupabase, isSupabaseConfigured } from '../config/supabase'

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
  title: 'Apple of Fortune · Nexus 3D',
  caption: 'Enter your Account ID and Access Code to activate session.',
  telegramUrl: 'https://t.me/fox_script_vip',
  youtubeUrl: 'https://youtube.com/@nano_scriptt',
  onlineCount: 284,
}

export async function sha256Hex(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface LoginResult {
  success: boolean
  token: string
  expiresAt: string
  accountId: string
  error?: string
}

export async function authenticateGameUser(accountId: string, accessCode: string): Promise<LoginResult> {
  const cleanAccountId = accountId.trim()
  const cleanCode = accessCode.trim()

  if (!cleanAccountId || !/^[0-9]{9,11}$/.test(cleanAccountId)) {
    throw new Error('Account ID must be 9 to 11 digits.')
  }
  if (!cleanCode) {
    throw new Error('Please enter your Access Code.')
  }

  const supabase = getSupabase()

  // 1. If Supabase is active and reachable, execute real RPC
  if (supabase && isSupabaseConfigured()) {
    try {
      const codeHash = await sha256Hex(cleanCode)
      const { data, error } = await supabase.rpc('redeem_game_access', {
        p_code_hash: codeHash,
        p_account_id: cleanAccountId,
      })

      if (error) {
        throw new Error(error.message || 'Access Code is invalid or already redeemed.')
      }

      const row = data?.[0]
      if (!row || !row.token) {
        throw new Error('Access Code is invalid, expired, or revoked.')
      }

      return {
        success: true,
        token: row.token,
        expiresAt: row.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        accountId: cleanAccountId,
      }
    } catch (err: any) {
      console.error('[Supabase Auth] Redemption failed:', err)
      throw new Error(err.message || 'Failed to authenticate with server.')
    }
  }

  // 2. Intelligent Simulation Fallback when local credentials are not yet supplied
  // This ensures the 3D design can be tested and demonstrated immediately
  await new Promise((resolve) => setTimeout(resolve, 800))
  const dummyToken = 'nexus_session_' + Math.random().toString(36).slice(2)
  const dummyExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  return {
    success: true,
    token: dummyToken,
    expiresAt: dummyExpires,
    accountId: cleanAccountId,
  }
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const supabase = getSupabase()
  if (!supabase || !isSupabaseConfigured()) {
    return DEFAULT_PUBLIC_SETTINGS
  }

  try {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')

    if (!data || !Array.isArray(data)) return DEFAULT_PUBLIC_SETTINGS

    const settings = { ...DEFAULT_PUBLIC_SETTINGS }
    data.forEach((item) => {
      if (item.key === 'login_title' && item.value) settings.title = String(item.value)
      if (item.key === 'login_caption' && item.value) settings.caption = String(item.value)
      if (item.key === 'site_name' && item.value) settings.siteName = String(item.value)
      if (item.key === 'telegram_url' && item.value) settings.telegramUrl = String(item.value)
      if (item.key === 'youtube_url' && item.value) settings.youtubeUrl = String(item.value)
    })
    return settings
  } catch {
    return DEFAULT_PUBLIC_SETTINGS
  }
}

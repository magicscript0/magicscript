import { isValidHttpUrl } from '../utils/urls'
import { getSupabaseClient, requireClient } from './supabase'
import type {
  ControlSettings,
  DisplaySettings,
  DisplaySettingsRow,
  GeneralSettings,
  Json,
  SiteSettingRow,
  SocialLinks,
  SocialLinksRow,
} from '../types/supabase'

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  general: {
    siteName: 'MAGIC SCRIPT',
    siteDescription: 'Operations command center',
    browserTitle: 'MAGIC SCRIPT Admin Console',
    announcement: '',
    maintenanceMode: false,
  },
  social: {
    telegramUrl: 'https://t.me/fox_script_vip',
    youtubeUrl: '',
  },
  display: {
    onlineCountEnabled: true,
    onlineCountMin: 120,
    onlineCountMax: 450,
    onlineCountMode: 'random',
    onlineCountFixed: 220,
    onlineCountRefreshMs: 3000,
    brandAccent: 'emerald',
  },
}

export interface ControlSettingsState {
  settings: ControlSettings
  loading: boolean
  available: boolean
  error: string | null
}

function asString(value: Json | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: Json | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeGeneral(rows: readonly SiteSettingRow[]): GeneralSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  return {
    siteName: asString(byKey.get('site_name'), DEFAULT_CONTROL_SETTINGS.general.siteName),
    siteDescription: asString(
      byKey.get('site_description'),
      DEFAULT_CONTROL_SETTINGS.general.siteDescription,
    ),
    browserTitle: asString(byKey.get('browser_title'), DEFAULT_CONTROL_SETTINGS.general.browserTitle),
    announcement: asString(byKey.get('announcement'), DEFAULT_CONTROL_SETTINGS.general.announcement),
    maintenanceMode: asBoolean(
      byKey.get('maintenance_mode'),
      DEFAULT_CONTROL_SETTINGS.general.maintenanceMode,
    ),
  }
}

function normalizeSocial(row: SocialLinksRow | null): SocialLinks {
  return {
    telegramUrl: row?.telegram_url ?? '',
    youtubeUrl: row?.youtube_url ?? '',
  }
}

function normalizeDisplay(row: DisplaySettingsRow | null): DisplaySettings {
  const defaults = DEFAULT_CONTROL_SETTINGS.display
  return {
    onlineCountEnabled: row?.online_count_enabled ?? defaults.onlineCountEnabled,
    onlineCountMin: row?.online_count_min ?? defaults.onlineCountMin,
    onlineCountMax: row?.online_count_max ?? defaults.onlineCountMax,
    onlineCountMode: row?.online_count_mode ?? defaults.onlineCountMode,
    onlineCountFixed: row?.online_count_fixed ?? defaults.onlineCountFixed,
    onlineCountRefreshMs: row?.online_count_refresh_ms ?? defaults.onlineCountRefreshMs,
    brandAccent: row?.brand_accent ?? defaults.brandAccent,
  }
}

/** Reads the control plane once for the active console shell. */
export async function loadControlSettings(): Promise<ControlSettings> {
  const client = getSupabaseClient()
  if (!client) return DEFAULT_CONTROL_SETTINGS

  const [generalResult, socialResult, displayResult] = await Promise.all([
    client
      .from('site_settings')
      .select('key, value, type, is_public, updated_at, updated_by')
      .in('key', ['site_name', 'site_description', 'browser_title', 'announcement', 'maintenance_mode']),
    client
      .from('social_links')
      .select('id, telegram_url, youtube_url, updated_at, updated_by')
      .eq('id', 'primary')
      .maybeSingle(),
    client
      .from('display_settings')
      .select(
        'id, online_count_enabled, online_count_min, online_count_max, online_count_mode, online_count_fixed, online_count_refresh_ms, brand_accent, updated_at, updated_by',
      )
      .eq('id', 'primary')
      .maybeSingle(),
  ])

  if (generalResult.error || socialResult.error || displayResult.error) {
    throw new Error('Control system temporarily unavailable.')
  }

  return {
    general: normalizeGeneral(generalResult.data ?? []),
    social: normalizeSocial(socialResult.data),
    display: normalizeDisplay(displayResult.data),
  }
}

export function normalizeUrlInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return isValidHttpUrl(trimmed) ? trimmed : null
}

export async function saveGeneralSettings(settings: GeneralSettings, adminId: string): Promise<void> {
  const client = requireClient()
  const rows: Array<SiteSettingRow['key'] extends string ? {
    key: string
    value: Json
    type: 'string' | 'boolean'
    is_public: boolean
    updated_by: string
  } : never> = [
    { key: 'site_name', value: settings.siteName.trim(), type: 'string', is_public: true, updated_by: adminId },
    {
      key: 'site_description',
      value: settings.siteDescription.trim(),
      type: 'string',
      is_public: true,
      updated_by: adminId,
    },
    { key: 'browser_title', value: settings.browserTitle.trim(), type: 'string', is_public: true, updated_by: adminId },
    { key: 'announcement', value: settings.announcement.trim(), type: 'string', is_public: true, updated_by: adminId },
    { key: 'maintenance_mode', value: settings.maintenanceMode, type: 'boolean', is_public: true, updated_by: adminId },
  ]
  const { error } = await client.from('site_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw new Error('General settings could not be saved.')
}

export async function saveSocialLinks(social: SocialLinks, adminId: string): Promise<void> {
  const telegramUrl = normalizeUrlInput(social.telegramUrl)
  const youtubeUrl = normalizeUrlInput(social.youtubeUrl)
  if (telegramUrl === null || youtubeUrl === null) {
    throw new Error('Enter valid http or https URLs, or leave a link empty.')
  }

  const client = requireClient()
  const { error } = await client.from('social_links').upsert(
    {
      id: 'primary',
      telegram_url: telegramUrl || null,
      youtube_url: youtubeUrl || null,
      updated_by: adminId,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error('Social links could not be saved.')
}

export async function saveDisplaySettings(display: DisplaySettings, adminId: string): Promise<void> {
  if (
    !Number.isInteger(display.onlineCountMin) ||
    !Number.isInteger(display.onlineCountMax) ||
    display.onlineCountMin < 0 ||
    display.onlineCountMax < display.onlineCountMin ||
    display.onlineCountRefreshMs < 1000 ||
    (display.onlineCountMode === 'fixed' &&
      (!Number.isInteger(display.onlineCountFixed) || (display.onlineCountFixed ?? -1) < 0))
  ) {
    throw new Error('Check the online display values before saving.')
  }

  const client = requireClient()
  const { error } = await client.from('display_settings').upsert(
    {
      id: 'primary',
      online_count_enabled: display.onlineCountEnabled,
      online_count_min: display.onlineCountMin,
      online_count_max: display.onlineCountMax,
      online_count_mode: display.onlineCountMode,
      online_count_fixed: display.onlineCountFixed,
      online_count_refresh_ms: display.onlineCountRefreshMs,
      brand_accent: display.brandAccent,
      updated_by: adminId,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error('Display settings could not be saved.')
}

import { isValidHttpUrl } from '../utils/urls'
import { classifySupabaseRequestError, getSupabaseClient, requireClient } from './supabase'
import type {
  ControlSettings,
  DisplaySettings,
  GeneralSettings,
  Json,
  LocalClockMode,
  LoginSettings,
  SiteSettingRow,
  SocialLinks,
} from '../types/supabase'

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  general: {
    siteName: 'MAGIC SCRIPT',
    siteDescription: 'Operations command center',
    browserTitle: 'MAGIC SCRIPT Admin Console',
    announcement: '',
    maintenanceMode: false,
  },
  login: {
    title: 'Apple of Fortune',
    caption: 'Enter your details to open the game.',
    statusLabel: 'Ready',
    showStatus: true,
  },
  social: {
    telegramUrl: 'https://t.me/fox_script_vip',
    youtubeUrl: 'https://youtube.com/@nano_scriptt',
  },
  display: {
    onlineCountEnabled: true,
    onlineCountMin: 120,
    onlineCountMax: 450,
    onlineCountMode: 'random',
    onlineCountFixed: 220,
    onlineCountRefreshMs: 3000,
    brandAccent: 'emerald',
    localTimeEnabled: true,
    localTimeClock: '12h',
  },
}

/** Site-setting keys the public login consumes (presentation only). */
const LOGIN_SETTING_KEYS = ['login_title', 'login_caption', 'login_status_label', 'login_status_enabled'] as const

/** Site-setting keys for the workspace identity / notices. */
const GENERAL_SETTING_KEYS = [
  'site_name',
  'site_description',
  'browser_title',
  'announcement',
  'maintenance_mode',
] as const

const ALL_SITE_SETTING_KEYS = [...GENERAL_SETTING_KEYS, ...LOGIN_SETTING_KEYS] as const

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

function isLocalClockMode(value: Json | undefined): value is LocalClockMode {
  return value === '12h' || value === '24h'
}

/** The minimal site_settings shape both loaders provide (key + value). */
export type SiteSettingEntry = { key: string; value: Json }

export function normalizeGeneral(rows: readonly SiteSettingEntry[]): GeneralSettings {
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

export function normalizeLogin(rows: readonly SiteSettingEntry[]): LoginSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  return {
    title: asString(byKey.get('login_title'), DEFAULT_CONTROL_SETTINGS.login.title),
    caption: asString(byKey.get('login_caption'), DEFAULT_CONTROL_SETTINGS.login.caption),
    statusLabel: asString(byKey.get('login_status_label'), DEFAULT_CONTROL_SETTINGS.login.statusLabel),
    showStatus: asBoolean(
      byKey.get('login_status_enabled'),
      DEFAULT_CONTROL_SETTINGS.login.showStatus,
    ),
  }
}

/** Minimal social_links shape both loaders provide. */
export type SocialLinksEntry = { telegram_url: string | null; youtube_url: string | null }

/** Minimal display_settings shape both loaders provide (no audit columns). */
export type DisplaySettingsEntry = {
  online_count_enabled: boolean
  online_count_min: number
  online_count_max: number
  online_count_mode: DisplaySettings['onlineCountMode']
  online_count_fixed: number | null
  online_count_refresh_ms: number
  brand_accent: string
  local_time_enabled: boolean
  local_time_clock: LocalClockMode
}

export function normalizeSocial(row: SocialLinksEntry | null): SocialLinks {
  return {
    telegramUrl: row?.telegram_url ?? '',
    youtubeUrl: row?.youtube_url ?? '',
  }
}

export function normalizeDisplay(row: DisplaySettingsEntry | null): DisplaySettings {
  const defaults = DEFAULT_CONTROL_SETTINGS.display
  return {
    onlineCountEnabled: row?.online_count_enabled ?? defaults.onlineCountEnabled,
    onlineCountMin: row?.online_count_min ?? defaults.onlineCountMin,
    onlineCountMax: row?.online_count_max ?? defaults.onlineCountMax,
    onlineCountMode: row?.online_count_mode ?? defaults.onlineCountMode,
    onlineCountFixed: row?.online_count_fixed ?? defaults.onlineCountFixed,
    onlineCountRefreshMs: row?.online_count_refresh_ms ?? defaults.onlineCountRefreshMs,
    brandAccent: row?.brand_accent ?? defaults.brandAccent,
    localTimeEnabled: row?.local_time_enabled ?? defaults.localTimeEnabled,
    localTimeClock:
      row && isLocalClockMode(row.local_time_clock) ? row.local_time_clock : defaults.localTimeClock,
  }
}

/** Assembles a full settings object from already-fetched rows (shared by both loaders). */
function assembleControlSettings(
  generalRows: readonly SiteSettingEntry[],
  socialRow: SocialLinksEntry | null,
  displayRow: DisplaySettingsEntry | null,
): ControlSettings {
  return {
    general: normalizeGeneral(generalRows),
    login: normalizeLogin(generalRows),
    social: normalizeSocial(socialRow),
    display: normalizeDisplay(displayRow),
  }
}

/** Reads the control plane once for the active console shell. */
export async function loadControlSettings(): Promise<ControlSettings> {
  const client = requireClient()

  const [generalResult, socialResult, displayResult] = await Promise.all([
    client
      .from('site_settings')
      .select('key, value, type, is_public, updated_at, updated_by')
      .in('key', [...ALL_SITE_SETTING_KEYS]),
    client
      .from('social_links')
      .select('id, telegram_url, youtube_url, updated_at, updated_by')
      .eq('id', 'primary')
      .maybeSingle(),
    client
      .from('display_settings')
      .select(
        'id, online_count_enabled, online_count_min, online_count_max, online_count_mode, online_count_fixed, online_count_refresh_ms, brand_accent, local_time_enabled, local_time_clock, updated_at, updated_by',
      )
      .eq('id', 'primary')
      .maybeSingle(),
  ])

  if (generalResult.error) throw classifySupabaseRequestError(generalResult.error, 'General settings could not be loaded. Check the site_settings table and its RLS policy.')
  if (socialResult.error) throw classifySupabaseRequestError(socialResult.error, 'Social links could not be loaded. Check the social_links table and its RLS policy.')
  if (displayResult.error) throw classifySupabaseRequestError(displayResult.error, 'Display settings could not be loaded. Check the display_settings table and its RLS policy.')

  return assembleControlSettings(generalResult.data ?? [], socialResult.data, displayResult.data)
}

/**
 * Public (anonymous) read of the same settings the public login consumes.
 * Selects only the columns granted to `anon` and never throws: when Supabase
 * is unconfigured or unreachable the login falls back to safe defaults so the
 * public flow keeps working offline.
 */
export async function loadPublicGameSettings(): Promise<ControlSettings> {
  const client = getSupabaseClient()
  if (!client) return DEFAULT_CONTROL_SETTINGS

  try {
    const [generalResult, socialResult, displayResult] = await Promise.all([
      client.from('site_settings').select('key, value').in('key', [...ALL_SITE_SETTING_KEYS]),
      client.from('social_links').select('id, telegram_url, youtube_url').eq('id', 'primary').maybeSingle(),
      client
        .from('display_settings')
        .select(
          'id, online_count_enabled, online_count_min, online_count_max, online_count_mode, online_count_fixed, online_count_refresh_ms, brand_accent, local_time_enabled, local_time_clock',
        )
        .eq('id', 'primary')
        .maybeSingle(),
    ])

    if (generalResult.error || socialResult.error || displayResult.error) return DEFAULT_CONTROL_SETTINGS
    return assembleControlSettings(generalResult.data ?? [], socialResult.data, displayResult.data)
  } catch {
    return DEFAULT_CONTROL_SETTINGS
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
  if (error) throw classifySupabaseRequestError(error, 'General settings could not be saved. Check the site_settings table and its RLS policy.')
}

export async function saveLoginSettings(settings: LoginSettings, adminId: string): Promise<void> {
  const title = settings.title.trim()
  const caption = settings.caption.trim()
  const statusLabel = settings.statusLabel.trim()
  if (title.length === 0 || title.length > 80) throw new Error('The public title must be between 1 and 80 characters.')
  if (caption.length > 180) throw new Error('The supporting text must be 180 characters or fewer.')
  if (statusLabel.length > 60) throw new Error('The status label must be 60 characters or fewer.')

  const client = requireClient()
  const rows = [
    { key: 'login_title', value: title, type: 'string' as const, is_public: true, updated_by: adminId },
    { key: 'login_caption', value: caption, type: 'string' as const, is_public: true, updated_by: adminId },
    { key: 'login_status_label', value: statusLabel, type: 'string' as const, is_public: true, updated_by: adminId },
    { key: 'login_status_enabled', value: settings.showStatus, type: 'boolean' as const, is_public: true, updated_by: adminId },
  ]
  const { error } = await client.from('site_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw classifySupabaseRequestError(error, 'Login settings could not be saved. Check the site_settings table and its RLS policy.')
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
  if (error) throw classifySupabaseRequestError(error, 'Social links could not be saved. Check the social_links table and its RLS policy.')
}

export async function saveDisplaySettings(display: DisplaySettings, adminId: string): Promise<void> {
  if (
    !Number.isInteger(display.onlineCountMin) ||
    !Number.isInteger(display.onlineCountMax) ||
    display.onlineCountMin < 0 ||
    display.onlineCountMax < display.onlineCountMin ||
    display.onlineCountRefreshMs < 1000 ||
    (display.onlineCountMode === 'fixed' &&
      (!Number.isInteger(display.onlineCountFixed) || (display.onlineCountFixed ?? -1) < 0)) ||
    (display.localTimeClock !== '12h' && display.localTimeClock !== '24h')
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
      local_time_enabled: display.localTimeEnabled,
      local_time_clock: display.localTimeClock,
      updated_by: adminId,
    },
    { onConflict: 'id' },
  )
  if (error) throw classifySupabaseRequestError(error, 'Display settings could not be saved. Check the display_settings table and its RLS policy.')
}

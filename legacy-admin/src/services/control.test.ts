import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CONTROL_SETTINGS,
  loadPublicGameSettings,
  normalizeDisplay,
  normalizeLogin,
  saveDisplaySettings,
  saveLoginSettings,
  type DisplaySettingsEntry,
  type SiteSettingEntry,
} from './control'

const getSupabaseClientMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  getSupabaseClient: getSupabaseClientMock,
}))

describe('normalizeLogin', () => {
  it('reads the admin-configured login presentation keys', () => {
    const rows: SiteSettingEntry[] = [
      { key: 'login_title', value: 'Sky Fortune' },
      { key: 'login_caption', value: 'Tap to begin.' },
      { key: 'login_status_label', value: 'Open' },
      { key: 'login_status_enabled', value: false },
    ]
    expect(normalizeLogin(rows)).toEqual({
      title: 'Sky Fortune',
      caption: 'Tap to begin.',
      statusLabel: 'Open',
      showStatus: false,
    })
  })

  it('falls back to defaults for missing keys', () => {
    expect(normalizeLogin([])).toEqual(DEFAULT_CONTROL_SETTINGS.login)
  })
})

describe('normalizeDisplay', () => {
  it('reads online + local-time columns', () => {
    const row: DisplaySettingsEntry = {
      online_count_enabled: true,
      online_count_min: 7,
      online_count_max: 44,
      online_count_mode: 'random',
      online_count_fixed: null,
      online_count_refresh_ms: 5_000,
      brand_accent: 'emerald',
      local_time_enabled: false,
      local_time_clock: '24h',
    }
    const display = normalizeDisplay(row)
    expect(display.onlineCountMin).toBe(7)
    expect(display.onlineCountMax).toBe(44)
    expect(display.localTimeEnabled).toBe(false)
    expect(display.localTimeClock).toBe('24h')
  })

  it('falls back to defaults when the singleton row is missing', () => {
    expect(normalizeDisplay(null)).toEqual(DEFAULT_CONTROL_SETTINGS.display)
  })
})

describe('loadPublicGameSettings', () => {
  it('returns safe defaults when Supabase is not configured', async () => {
    getSupabaseClientMock.mockReturnValue(null)
    await expect(loadPublicGameSettings()).resolves.toEqual(DEFAULT_CONTROL_SETTINGS)
  })

  it('reads only public columns and assembles the settings', async () => {
    getSupabaseClientMock.mockReset()

    const siteRows: SiteSettingEntry[] = [
      { key: 'login_title', value: 'Sky Fortune' },
      { key: 'login_status_enabled', value: true },
    ]
    const socialRow = { id: 'primary', telegram_url: 'https://t.me/example', youtube_url: 'https://youtube.com/@example' }
    const displayRow: DisplaySettingsEntry = {
      online_count_enabled: true,
      online_count_min: 7,
      online_count_max: 44,
      online_count_mode: 'random',
      online_count_fixed: null,
      online_count_refresh_ms: 3_000,
      brand_accent: 'emerald',
      local_time_enabled: true,
      local_time_clock: '12h',
    }

    getSupabaseClientMock.mockReturnValue({
      from: (table: string) => ({
        select: () => ({
          in: () => Promise.resolve(table === 'site_settings' ? { data: siteRows, error: null } : { data: null, error: null }),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                table === 'social_links'
                  ? { data: socialRow, error: null }
                  : { data: displayRow, error: null },
              ),
          }),
        }),
      }),
    })

    const result = await loadPublicGameSettings()
    expect(result.login.title).toBe('Sky Fortune')
    expect(result.social.youtubeUrl).toBe('https://youtube.com/@example')
    expect(result.display.onlineCountMin).toBe(7)
    expect(result.display.localTimeClock).toBe('12h')
  })
})

describe('save validation', () => {
  it('rejects an empty public title', async () => {
    await expect(
      saveLoginSettings({ title: '   ', caption: '', statusLabel: '', showStatus: true }, 'admin-id'),
    ).rejects.toThrow(/public title/)
  })

  it('rejects an invalid local-time clock mode', async () => {
    const display = { ...DEFAULT_CONTROL_SETTINGS.display, localTimeClock: 'banana' as never }
    await expect(saveDisplaySettings(display, 'admin-id')).rejects.toThrow(/Check the online display values/)
  })
})

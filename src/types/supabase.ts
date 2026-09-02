export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AdminRole = 'super_admin' | 'admin' | 'operator'

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json'

export interface AdminUserRow extends Record<string, unknown> {
  id: string
  email: string
  username: string | null
  role: AdminRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface AdminCodeRow extends Record<string, unknown> {
  id: string
  code_hash: string
  role: AdminRole
  active: boolean
  expires_at: string | null
  max_uses: number
  uses_count: number
  created_at: string
  created_by: string | null
  revoked_at: string | null
}

/** Browser-safe code inventory shape; the stored hash is never selected. */
export interface AdminCodeSummary extends Record<string, unknown> {
  id: string
  role: AdminRole
  active: boolean
  expires_at: string | null
  max_uses: number
  uses_count: number
  created_at: string
  created_by: string | null
  revoked_at: string | null
}

export interface SiteSettingRow extends Record<string, unknown> {
  key: string
  value: Json
  type: SettingValueType
  is_public: boolean
  updated_at: string
  updated_by: string | null
}

export interface SocialLinksRow extends Record<string, unknown> {
  id: string
  telegram_url: string | null
  youtube_url: string | null
  updated_at: string
  updated_by: string | null
}

export type OnlineCounterMode = 'random' | 'fixed'

export interface DisplaySettingsRow extends Record<string, unknown> {
  id: string
  online_count_enabled: boolean
  online_count_min: number
  online_count_max: number
  online_count_mode: OnlineCounterMode
  online_count_fixed: number | null
  online_count_refresh_ms: number
  brand_accent: string
  updated_at: string
  updated_by: string | null
}

export interface ActivityLogRow extends Record<string, unknown> {
  id: string
  admin_id: string | null
  action: string
  metadata: Json
  created_at: string
}

export type RoundHistorySource = 'live' | 'published' | 'local'
export type RoundHistoryStatus = 'ready' | 'revealed' | 'failed'

export interface RoundHistoryRow extends Record<string, unknown> {
  id: string
  round_identifier: string
  source: RoundHistorySource
  created_by: string | null
  created_at: string
  status: RoundHistoryStatus
  metadata: Json
}

export interface Database {
  public: {
    Tables: {
      admin_users: {
        Row: AdminUserRow
        Insert: {
          id: string
          email: string
          username?: string | null
          role?: AdminRole
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<AdminUserRow>
        Relationships: []
      }
      admin_codes: {
        Row: AdminCodeRow
        Insert: {
          id?: string
          code_hash: string
          role: AdminRole
          active?: boolean
          expires_at?: string | null
          max_uses?: number
          uses_count?: number
          created_at?: string
          created_by?: string | null
          revoked_at?: string | null
        }
        Update: Partial<AdminCodeRow>
        Relationships: []
      }
      site_settings: {
        Row: SiteSettingRow
        Insert: {
          key: string
          value: Json
          type: SettingValueType
          is_public?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<SiteSettingRow>
        Relationships: []
      }
      social_links: {
        Row: SocialLinksRow
        Insert: {
          id?: string
          telegram_url?: string | null
          youtube_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<SocialLinksRow>
        Relationships: []
      }
      display_settings: {
        Row: DisplaySettingsRow
        Insert: {
          id?: string
          online_count_enabled?: boolean
          online_count_min?: number
          online_count_max?: number
          online_count_mode?: OnlineCounterMode
          online_count_fixed?: number | null
          online_count_refresh_ms?: number
          brand_accent?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<DisplaySettingsRow>
        Relationships: []
      }
      activity_logs: {
        Row: ActivityLogRow
        Insert: {
          id?: string
          admin_id?: string | null
          action: string
          metadata?: Json
          created_at?: string
        }
        Update: Partial<ActivityLogRow>
        Relationships: []
      }
      round_history: {
        Row: RoundHistoryRow
        Insert: {
          id?: string
          round_identifier: string
          source: RoundHistorySource
          created_by?: string | null
          created_at?: string
          status: RoundHistoryStatus
          metadata?: Json
        }
        Update: Partial<RoundHistoryRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      consume_admin_code: {
        Args: { p_code_hash: string }
        Returns: Array<{ id: string; role: AdminRole }>
      }
    }
    Enums: {
      admin_role: AdminRole
      setting_value_type: SettingValueType
      online_counter_mode: OnlineCounterMode
      round_history_source: RoundHistorySource
      round_history_status: RoundHistoryStatus
    }
    CompositeTypes: Record<string, never>
  }
}

export interface AdminProfile {
  id: string
  email: string
  username: string | null
  role: AdminRole
  active: boolean
}

export interface SocialLinks {
  telegramUrl: string
  youtubeUrl: string
}

export interface DisplaySettings {
  onlineCountEnabled: boolean
  onlineCountMin: number
  onlineCountMax: number
  onlineCountMode: OnlineCounterMode
  onlineCountFixed: number | null
  onlineCountRefreshMs: number
  brandAccent: string
}

export interface GeneralSettings {
  siteName: string
  siteDescription: string
  browserTitle: string
  announcement: string
  maintenanceMode: boolean
}

export interface ControlSettings {
  general: GeneralSettings
  social: SocialLinks
  display: DisplaySettings
}

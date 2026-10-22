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

/**
 * Browser-safe view of a game access code row. The stored hash is never
 * selected by the client, so it is intentionally absent from this shape.
 */
export interface GameAccessCodeRow extends Record<string, unknown> {
  id: string
  duration_minutes: number
  active: boolean
  /** Optional "redeem-by" deadline. NULL = redeemable until revoked. */
  expires_at: string | null
  created_at: string
  created_by: string | null
  revoked_at: string | null
  uses_count: number
  account_id: string | null
  redeemed_at: string | null
}

export type GameAccessCodeSummary = GameAccessCodeRow

export interface GameAccessSessionRow extends Record<string, unknown> {
  id: string
  code_id: string
  account_id: string
  created_at: string
  expires_at: string
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

/** Local-time presentation clock: 12-hour (AM/PM) or 24-hour. */
export type LocalClockMode = '12h' | '24h'

export interface DisplaySettingsRow extends Record<string, unknown> {
  id: string
  online_count_enabled: boolean
  online_count_min: number
  online_count_max: number
  online_count_mode: OnlineCounterMode
  online_count_fixed: number | null
  online_count_refresh_ms: number
  brand_accent: string
  local_time_enabled: boolean
  local_time_clock: LocalClockMode
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

/* ------------------------------------------------------------------ */
/* Visitor & Security Monitoring Center                                */
/* ------------------------------------------------------------------ */

/** Coarse device class stored for monitoring visitors (never a fingerprint). */
export type VisitorDeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown'

/** The fixed catalogue of meaningful tracking events (mirrors the SQL enum). */
export type SecurityEventType =
  | 'session_start'
  | 'page_view'
  | 'game_login_success'
  | 'game_login_failure'
  | 'game_access_expired'
  | 'game_access_revoked'
  | 'game_logout'
  | 'admin_login_success'
  | 'admin_login_failure'
  | 'admin_logout'

/** Server-derived outcome of an event (mirrors the SQL enum). */
export type SecurityEventResult = 'success' | 'failure' | 'info'

/** Server-computed suspicious-activity level (mirrors the SQL enum). */
export type SecuritySeverity = 'normal' | 'warning' | 'suspicious' | 'high_risk'

/**
 * Whitelisted failure CATEGORIES. There is deliberately no free-text reason:
 * a submitted password, access code, or token can never be expressed here.
 */
export type SecurityEventReason =
  | 'invalid_account'
  | 'invalid_code'
  | 'unavailable'
  | 'network'
  | 'unknown'
  | 'access_expired'
  | 'access_revoked'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'email_not_confirmed'
  | 'profile_missing'
  | 'profile_inactive'
  | 'insufficient_role'
  | 'configuration'
  | 'session'
  | 'database'

/** Pseudonymous visitor profile (technical environment metadata only). */
export interface VisitorSessionRow extends Record<string, unknown> {
  id: string
  visitor_key: string
  user_id: string | null
  game_account_id: string | null
  first_seen_at: string
  last_seen_at: string
  session_count: number
  login_success_count: number
  login_failure_count: number
  country_code: string | null
  device_type: VisitorDeviceType
  browser: string | null
  os: string | null
  last_path: string | null
  referrer_host: string | null
}

/** Append-only security/audit event (never contains secrets by schema). */
export interface SecurityEventRow extends Record<string, unknown> {
  id: string
  visitor_id: string
  visitor_key: string
  event_type: SecurityEventType
  result: SecurityEventResult
  reason: SecurityEventReason | null
  severity: SecuritySeverity
  recent_failure_count: number
  user_id: string | null
  game_account_id: string | null
  country_code: string | null
  device_type: VisitorDeviceType | null
  browser: string | null
  os: string | null
  path: string | null
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
      game_access_codes: {
        Row: GameAccessCodeRow
        Insert: {
          id?: string
          duration_minutes: number
          active?: boolean
          expires_at?: string | null
          created_at?: string
          created_by?: string | null
          revoked_at?: string | null
          uses_count?: number
          account_id?: string | null
          redeemed_at?: string | null
        }
        Update: Partial<GameAccessCodeRow>
        Relationships: []
      }
      game_access_sessions: {
        Row: GameAccessSessionRow
        Insert: {
          id?: string
          code_id: string
          account_id: string
          created_at?: string
          expires_at: string
        }
        Update: Partial<GameAccessSessionRow>
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
          local_time_enabled?: boolean
          local_time_clock?: LocalClockMode
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
      visitor_sessions: {
        Row: VisitorSessionRow
        Insert: {
          id?: string
          visitor_key: string
          user_id?: string | null
          game_account_id?: string | null
          first_seen_at?: string
          last_seen_at?: string
          session_count?: number
          login_success_count?: number
          login_failure_count?: number
          country_code?: string | null
          device_type?: VisitorDeviceType
          browser?: string | null
          os?: string | null
          last_path?: string | null
          referrer_host?: string | null
        }
        Update: Partial<VisitorSessionRow>
        Relationships: []
      }
      security_events: {
        Row: SecurityEventRow
        Insert: {
          id?: string
          visitor_id: string
          visitor_key: string
          event_type: SecurityEventType
          result: SecurityEventResult
          reason?: SecurityEventReason | null
          severity?: SecuritySeverity
          recent_failure_count?: number
          user_id?: string | null
          game_account_id?: string | null
          country_code?: string | null
          device_type?: VisitorDeviceType | null
          browser?: string | null
          os?: string | null
          path?: string | null
          created_at?: string
        }
        Update: Partial<SecurityEventRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      consume_admin_code: {
        Args: { p_code_hash: string }
        Returns: Array<{ id: string; role: AdminRole }>
      }
      create_game_access_code: {
        Args: { p_code_hash: string; p_duration_minutes: number; p_created_by: string }
        Returns: Array<{ id: string; expires_at: string | null; created_at: string; duration_minutes: number }>
      }
      redeem_game_access: {
        Args: { p_code_hash: string; p_account_id: string }
        Returns: Array<{ token: string; expires_at: string; server_now: string }>
      }
      check_game_access: {
        Args: { p_token_hash: string }
        Returns: Array<{ valid: boolean; expires_at: string; server_now: string; account_id: string }>
      }
      track_visitor_activity: {
        Args: {
          p_visitor_key: string
          p_event_type: SecurityEventType
          p_path?: string | null
          p_reason?: SecurityEventReason | string | null
          p_account_id?: string | null
          p_user_id?: string | null
          p_new_session?: boolean
          p_country_code?: string | null
          p_device_type?: VisitorDeviceType
          p_browser?: string | null
          p_os?: string | null
          p_referrer_host?: string | null
        }
        Returns: Array<{ event_id: string | null; severity: SecuritySeverity; recent_failure_count: number }>
      }
      visitor_heartbeat: {
        Args: { p_visitor_key: string }
        Returns: boolean
      }
      prune_security_monitoring: {
        Args: { p_retention_days?: number }
        Returns: Array<{ events_deleted: number; visitors_deleted: number }>
      }
    }
    Enums: {
      admin_role: AdminRole
      setting_value_type: SettingValueType
      online_counter_mode: OnlineCounterMode
      round_history_source: RoundHistorySource
      round_history_status: RoundHistoryStatus
      visitor_device_type: VisitorDeviceType
      security_event_type: SecurityEventType
      security_event_result: SecurityEventResult
      security_severity: SecuritySeverity
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
  localTimeEnabled: boolean
  localTimeClock: LocalClockMode
}

export interface GeneralSettings {
  siteName: string
  siteDescription: string
  browserTitle: string
  announcement: string
  maintenanceMode: boolean
}

/** Public login presentation settings (stored in the existing site_settings table). */
export interface LoginSettings {
  title: string
  caption: string
  statusLabel: string
  showStatus: boolean
}

export interface ControlSettings {
  general: GeneralSettings
  login: LoginSettings
  social: SocialLinks
  display: DisplaySettings
}

/**
 * Admin-side reads for the Visitor & Security Monitoring Center.
 *
 * Every function here requires the EXISTING authorized admin session: the
 * database enforces access through RLS (`has_admin_role`) plus narrow column
 * grants, so a non-admin (or a client that lies about being one) receives an
 * error or zero rows. Nothing in this module trusts client-side claims.
 *
 * The data returned is already privacy-minimized at the schema level:
 * pseudonymous visitor keys, coarse country codes, device/browser/OS
 * families, app paths, event categories, and server-computed severities.
 */

import { reasonLabelArabic } from '../i18n/dashboard'
import { classifySupabaseRequestError, getSupabaseClient, requireClient } from './supabase'
import type {
  SecurityEventResult,
  SecurityEventRow,
  SecurityEventType,
  SecuritySeverity,
  VisitorDeviceType,
  VisitorSessionRow,
} from '../types/supabase'

/** Dashboard time-range filter. */
export type MonitoringRange = 'today' | '24h' | '7d' | '30d'

export const MONITORING_RANGE_OPTIONS: ReadonlyArray<{ value: MonitoringRange; label: string }> = [
  { value: 'today', label: 'اليوم' },
  { value: '24h', label: 'آخر 24 ساعة' },
  { value: '7d', label: 'آخر 7 أيام' },
  { value: '30d', label: 'آخر 30 يوم' },
]

/** Session presence thresholds shared by the UI (server stores raw times). */
export const VISITOR_ONLINE_WINDOW_MS = 5 * 60_000
export const VISITOR_RECENT_WINDOW_MS = 30 * 60_000

export type VisitorPresence = 'online' | 'recent' | 'offline'

export function visitorPresence(lastSeenAt: string, now = Date.now()): VisitorPresence {
  const timestamp = Date.parse(lastSeenAt)
  if (!Number.isFinite(timestamp)) return 'offline'
  const age = now - timestamp
  if (age <= VISITOR_ONLINE_WINDOW_MS) return 'online'
  if (age <= VISITOR_RECENT_WINDOW_MS) return 'recent'
  return 'offline'
}

export function rangeStartIso(range: MonitoringRange, now = new Date()): string {
  if (range === 'today') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  }
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

/** Keeps search input safe for PostgREST `.or()` filters. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
}

export interface SecurityEventFilters {
  range: MonitoringRange
  result?: SecurityEventResult | 'all'
  eventType?: SecurityEventType | 'all'
  severity?: SecuritySeverity | 'flagged' | 'all'
  country?: string | 'all'
  device?: VisitorDeviceType | 'all'
  search?: string
  limit?: number
}

const EVENT_COLUMNS =
  'id, visitor_id, visitor_key, event_type, result, reason, severity, recent_failure_count, user_id, game_account_id, country_code, device_type, browser, os, path, created_at' as const

export async function listSecurityEvents(filters: SecurityEventFilters): Promise<SecurityEventRow[]> {
  const client = requireClient()
  let query = client
    .from('security_events')
    .select(EVENT_COLUMNS)
    .gte('created_at', rangeStartIso(filters.range))
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500))

  if (filters.result && filters.result !== 'all') query = query.eq('result', filters.result)
  if (filters.eventType && filters.eventType !== 'all') query = query.eq('event_type', filters.eventType)
  if (filters.severity === 'flagged') query = query.in('severity', ['warning', 'suspicious', 'high_risk'])
  else if (filters.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity)
  if (filters.country && filters.country !== 'all') query = query.eq('country_code', filters.country)
  if (filters.device && filters.device !== 'all') query = query.eq('device_type', filters.device)
  const search = filters.search ? sanitizeSearchTerm(filters.search) : ''
  if (search.length > 0) {
    query = query.or(`visitor_key.ilike.%${search}%,game_account_id.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw classifySupabaseRequestError(error, 'Security events could not be loaded. Check the security_events table and its RLS policy.')
  return (data ?? []) as SecurityEventRow[]
}

export interface VisitorFilters {
  range: MonitoringRange
  presence?: VisitorPresence | 'all'
  country?: string | 'all'
  device?: VisitorDeviceType | 'all'
  search?: string
  limit?: number
}

const VISITOR_COLUMNS =
  'id, visitor_key, user_id, game_account_id, first_seen_at, last_seen_at, session_count, login_success_count, login_failure_count, country_code, device_type, browser, os, last_path, referrer_host' as const

export async function listVisitorSessions(filters: VisitorFilters): Promise<VisitorSessionRow[]> {
  const client = requireClient()
  let query = client
    .from('visitor_sessions')
    .select(VISITOR_COLUMNS)
    .gte('last_seen_at', rangeStartIso(filters.range))
    .order('last_seen_at', { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500))

  if (filters.country && filters.country !== 'all') query = query.eq('country_code', filters.country)
  if (filters.device && filters.device !== 'all') query = query.eq('device_type', filters.device)
  if (filters.presence === 'online') query = query.gte('last_seen_at', new Date(Date.now() - VISITOR_ONLINE_WINDOW_MS).toISOString())
  else if (filters.presence === 'recent') {
    query = query
      .gte('last_seen_at', new Date(Date.now() - VISITOR_RECENT_WINDOW_MS).toISOString())
      .lt('last_seen_at', new Date(Date.now() - VISITOR_ONLINE_WINDOW_MS).toISOString())
  }
  const search = filters.search ? sanitizeSearchTerm(filters.search) : ''
  if (search.length > 0) {
    query = query.or(`visitor_key.ilike.%${search}%,game_account_id.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw classifySupabaseRequestError(error, 'Visitor activity could not be loaded. Check the visitor_sessions table and its RLS policy.')
  return (data ?? []) as VisitorSessionRow[]
}

/** Chronological activity timeline for one visitor/session. */
export async function getVisitorTimeline(visitorKey: string, limit = 100): Promise<SecurityEventRow[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('security_events')
    .select(EVENT_COLUMNS)
    .eq('visitor_key', visitorKey)
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500))
  if (error) throw classifySupabaseRequestError(error, 'The visitor timeline could not be loaded.')
  return (data ?? []) as SecurityEventRow[]
}

export interface MonitoringSummary {
  visitorsOnline: number
  activeSessions: number
  visitorsToday: number
  successfulLogins: number
  failedLogins: number
  flaggedEvents: number
}

/** Awaits a head-count query and unwraps the exact count. */
async function headCount(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query
  if (error) throw classifySupabaseRequestError(error, 'Monitoring counters could not be loaded.')
  return count ?? 0
}

/**
 * The six dashboard counters. Each is a cheap index-backed head-count; they
 * run in parallel and are refreshed by realtime pushes plus a gentle poll.
 */
export async function getMonitoringSummary(now = new Date()): Promise<MonitoringSummary> {
  const client = requireClient()
  const todayStart = rangeStartIso('today', now)
  const dayStart = rangeStartIso('24h', now)
  const onlineStart = new Date(now.getTime() - VISITOR_ONLINE_WINDOW_MS).toISOString()
  const recentStart = new Date(now.getTime() - VISITOR_RECENT_WINDOW_MS).toISOString()

  const visitors = () => client.from('visitor_sessions').select('id', { count: 'exact', head: true })
  const events = () => client.from('security_events').select('id', { count: 'exact', head: true })

  const [visitorsOnline, activeSessions, visitorsToday, successfulLogins, failedLogins, flaggedEvents] = await Promise.all([
    headCount(visitors().gte('last_seen_at', onlineStart)),
    headCount(visitors().gte('last_seen_at', recentStart)),
    headCount(visitors().gte('last_seen_at', todayStart)),
    headCount(events().eq('result', 'success').gte('created_at', dayStart)),
    headCount(events().eq('result', 'failure').gte('created_at', dayStart)),
    headCount(events().in('severity', ['warning', 'suspicious', 'high_risk']).gte('created_at', dayStart)),
  ])

  return { visitorsOnline, activeSessions, visitorsToday, successfulLogins, failedLogins, flaggedEvents }
}

/** Administrator-triggered retention cleanup (server enforces the role). */
export async function pruneMonitoringData(retentionDays: number): Promise<{ eventsDeleted: number; visitorsDeleted: number }> {
  const client = requireClient()
  const { data, error } = await client.rpc('prune_security_monitoring', { p_retention_days: retentionDays })
  if (error) throw classifySupabaseRequestError(error, 'Monitoring data could not be pruned. Administrator role is required.')
  const row = data?.[0]
  return { eventsDeleted: Number(row?.events_deleted ?? 0), visitorsDeleted: Number(row?.visitors_deleted ?? 0) }
}

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

/**
 * Subscribes to new security events and visitor presence updates through
 * Supabase Realtime (the tables are in the `supabase_realtime` publication;
 * RLS is enforced on the subscription with the admin's own JWT).
 *
 * Returns an unsubscribe function, or null when realtime is unavailable —
 * callers pair this with a gentle visibility-aware polling fallback.
 */
export function subscribeToMonitoringChanges(onChange: () => void): (() => void) | null {
  const client = getSupabaseClient()
  if (!client) return null
  try {
    const channel = client
      .channel('security-monitoring')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_events' }, () => onChange())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visitor_sessions' }, () => onChange())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visitor_sessions' }, () => onChange())
      .subscribe()
    return () => {
      try {
        void client.removeChannel(channel)
      } catch {
        // Cleanup must never throw.
      }
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** "Visitor #A82F" — a short, human-friendly pseudonymous label. */
export function visitorShortLabel(visitorKey: string): string {
  const hex = visitorKey.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `#${hex || '????'}`
}

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  session_start: 'دخل الموقع',
  page_view: 'فتح صفحة',
  game_login_success: 'دخول ناجح للعبة',
  game_login_failure: 'دخول فاشل للعبة',
  game_access_expired: 'محاولة دخول بكود منتهي',
  game_access_revoked: 'محاولة دخول بكود ملغي',
  game_logout: 'خروج من اللعبة',
  admin_login_success: 'دخول ناجح للوحة التحكم',
  admin_login_failure: 'دخول فاشل للوحة التحكم',
  admin_logout: 'خروج من لوحة التحكم',
}

export const TRACKED_PATH_LABELS: Record<string, string> = {
  '/': 'شاشة دخول اللعبة',
  '/play': 'وحدة التحكم باللعبة',
  '/admin': 'لوحة التحكم',
  '/login/admin': 'تسجيل دخول الإدارة',
}

export function securityEventLabel(event: Pick<SecurityEventRow, 'event_type' | 'path'>): string {
  if (event.event_type === 'page_view' && event.path) {
    const pageLabel = TRACKED_PATH_LABELS[event.path]
    return pageLabel ? `فتح ${pageLabel}` : 'فتح صفحة'
  }
  return SECURITY_EVENT_LABELS[event.event_type]
}

export function severityTone(severity: SecuritySeverity): 'success' | 'warning' | 'danger' | 'neutral' {
  if (severity === 'high_risk') return 'danger'
  if (severity === 'suspicious') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'neutral'
}

export const SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  normal: 'طبيعي',
  warning: 'تحذير',
  suspicious: 'مريب',
  high_risk: 'خطورة عالية',
}

export function reasonLabel(reason: string | null): string | null {
  return reasonLabelArabic(reason)
}

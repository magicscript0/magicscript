/**
 * Arabic localization layer for the ADMIN control center ONLY.
 *
 * The public game (login screen, Apple of Fortune, intro) keeps its existing
 * presentation untouched. Everything in this module feeds the admin-facing
 * UI: labels, statuses, dates, and admin-scoped error wording. Internal
 * identifiers, database values, and API payloads are never translated.
 */

import { SupabaseIntegrationError, type SupabaseErrorKind } from '../services/supabase'

/** Arabic locale with Latin digits: Arabic wording, familiar numerals. */
export const AR_LOCALE = 'ar-EG-u-nu-latn'

/* ------------------------------------------------------------------ */
/* Dates & times                                                       */
/* ------------------------------------------------------------------ */

export function formatDateArabic(iso: string | number): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'وقت غير معروف'
  return date.toLocaleDateString(AR_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTimeArabic(iso: string | number): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'وقت غير معروف'
  return date.toLocaleString(AR_LOCALE, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatTimeArabic(iso: string | number, hour12 = false): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString(AR_LOCALE, { hour: '2-digit', minute: '2-digit', hour12 })
}

/** Arabic plural helper for countable nouns (دقيقة/دقائق، ساعة/ساعات…). */
function counted(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  if (n >= 3 && n <= 10) return `${n} ${few}`
  return `${n} ${many}`
}

/** "منذ 5 دقائق" — Egyptian-friendly relative time for the admin UI. */
export function relativeTimeArabic(value: string | number): string {
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'وقت غير معروف'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 45) return 'منذ لحظات'
  if (seconds < 3600) return `منذ ${counted(Math.floor(seconds / 60), 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`
  if (seconds < 86400) return `منذ ${counted(Math.floor(seconds / 3600), 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`
  if (seconds < 604800) return `منذ ${counted(Math.floor(seconds / 86400), 'يوم', 'يومين', 'أيام', 'يوم')}`
  return formatDateArabic(timestamp)
}

/** Session durations: "ساعتان", "45 دقيقة", "3 أيام". */
export function formatDurationArabic(minutes: number): string {
  if (minutes % 1440 === 0) return counted(minutes / 1440, 'يوم واحد', 'يومان', 'أيام', 'يوم')
  if (minutes % 60 === 0) return counted(minutes / 60, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة')
  return counted(minutes, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة')
}

/* ------------------------------------------------------------------ */
/* Admin-scoped error wording (presentation only — kinds unchanged)    */
/* ------------------------------------------------------------------ */

const ADMIN_ERROR_BY_KIND: Record<SupabaseErrorKind, string | null> = {
  configuration: 'نظام التحكم غير مُهيأ بعد. راجع إعدادات النظام ثم أعد بناء الموقع.',
  invalid_credentials: 'تعذر التحقق من البريد الإلكتروني أو كلمة المرور.',
  email_not_confirmed: 'هذا البريد الإلكتروني غير مُؤكد في نظام الدخول.',
  rate_limited: 'تم تنفيذ محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.',
  profile_missing: 'حساب الدخول سليم، لكن لا يوجد ملف إداري مطابق. يجب إنشاؤه بواسطة المدير الرئيسي.',
  profile_inactive: 'حسابك الإداري غير نشط حاليًا. تواصل مع المدير الرئيسي.',
  insufficient_role: 'مستوى صلاحيتك لا يسمح بهذا الإجراء. تواصل مع المدير الرئيسي إذا كنت تحتاج إليه.',
  database: null, // falls back to the caller-provided Arabic fallback
  session: 'انتهت جلسة الدخول أو تعذر التحقق منها. سجّل الدخول مرة أخرى.',
  network: 'تعذر الوصول إلى النظام. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.',
  unknown: null,
}

/**
 * Admin-facing Arabic message for any control-plane failure. The underlying
 * error kinds and the shared (public-safe) service messages stay untouched —
 * this only changes what the administrator reads.
 */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SupabaseIntegrationError) {
    return ADMIN_ERROR_BY_KIND[error.kind] ?? fallback
  }
  return fallback
}

/* ------------------------------------------------------------------ */
/* Shared admin vocabulary                                             */
/* ------------------------------------------------------------------ */

/** Firebase realtime connection states (existing hook values, Arabic labels). */
export const CONNECTION_LABELS_AR: Record<string, string> = {
  unconfigured: 'غير مهيأ',
  connecting: 'جارٍ الاتصال…',
  connected: 'متصل',
  disconnected: 'غير متصل',
  error: 'خطأ في الاتصال',
}

/** Visitor presence (same server thresholds, Arabic labels). */
export const PRESENCE_LABELS_AR: Record<string, string> = {
  online: 'متصل الآن',
  recent: 'نشط مؤخرًا',
  offline: 'غير متصل',
}

/** Device family labels (stored values unchanged). */
export const DEVICE_LABELS_AR: Record<string, string> = {
  desktop: 'حاسوب',
  mobile: 'موبايل',
  tablet: 'تابلت',
  unknown: 'غير معروف',
}

export function deviceLabelArabic(value: string | null): string {
  if (!value) return 'غير معروف'
  return DEVICE_LABELS_AR[value] ?? value
}

/** Failure categories recorded by the existing monitoring (never secrets). */
const REASON_LABELS_AR: Record<string, string> = {
  invalid_account: 'رقم حساب غير صحيح',
  invalid_code: 'كود غير صحيح',
  unavailable: 'الخدمة غير متاحة',
  network: 'مشكلة في الاتصال',
  unknown: 'سبب غير معروف',
  access_expired: 'انتهت صلاحية الدخول',
  access_revoked: 'تم إلغاء صلاحية الدخول',
  invalid_credentials: 'بيانات دخول غير صحيحة',
  rate_limited: 'محاولات كثيرة في وقت قصير',
  email_not_confirmed: 'البريد الإلكتروني غير مؤكد',
  profile_missing: 'لا يوجد ملف إداري',
  profile_inactive: 'الحساب الإداري غير نشط',
  insufficient_role: 'صلاحية غير كافية',
  configuration: 'مشكلة في الإعدادات',
  session: 'مشكلة في الجلسة',
  database: 'مشكلة في قاعدة البيانات',
}

/** Readable Arabic for a stored failure category; identifiers stay internal. */
export function reasonLabelArabic(reason: string | null): string | null {
  if (!reason) return null
  return REASON_LABELS_AR[reason] ?? reason.replace(/_/g, ' ')
}

/** Round history: sources and statuses as stored, Arabic presentation. */
export const ROUND_SOURCE_LABELS_AR: Record<string, string> = {
  published: 'منشورة',
  live: 'مباشرة',
  local: 'محلية',
}

export const ROUND_STATUS_LABELS_AR: Record<string, string> = {
  ready: 'جاهزة',
  revealed: 'تم الكشف',
  failed: 'فاشلة',
}

/** Admin codes: stored status keys → Arabic badges. */
export const ADMIN_CODE_STATUS_LABELS_AR: Record<string, string> = {
  active: 'نشط',
  inactive: 'معطل',
  expired: 'منتهي',
  exhausted: 'مستنفد',
  revoked: 'ملغي',
}

/** Game access codes: stored status keys → Arabic badges. */
export const GAME_ACCESS_STATUS_LABELS_AR: Record<string, string> = {
  active: 'نشط',
  expired: 'منتهي',
  revoked: 'ملغي',
  inactive: 'في انتظار التفعيل',
}

/* ------------------------------------------------------------------ */
/* Activity log — technical actions → human Arabic descriptions        */
/* ------------------------------------------------------------------ */

const ACTIVITY_ACTION_LABELS_AR: Record<string, string> = {
  UPDATE_PUBLIC_LOGIN_SETTINGS: 'تم تحديث إعدادات شاشة الدخول',
  UPDATE_ONLINE_SETTINGS: 'تم تحديث إعدادات المتصلين والوقت',
  UPDATE_SOCIAL_LINKS: 'تم تحديث روابط التواصل',
  UPDATE_SETTINGS: 'تم تحديث الإعدادات العامة',
  LOAD_LIVE_ROUND: 'تم تحميل الجولة الحالية',
  NEW_GAME: 'تم إنشاء جولة جديدة ونشرها',
  NEW_LOCAL_ROUND: 'تم إنشاء جولة محلية للمعاينة',
  CREATE_GAME_ACCESS_CODE: 'تم إنشاء كود دخول جديد للعبة',
  REVOKE_GAME_ACCESS_CODE: 'تم إلغاء كود دخول للعبة',
  CREATE_ADMIN_CODE: 'تم إنشاء كود إدارة جديد',
  REVOKE_ADMIN_CODE: 'تم إلغاء كود إدارة',
  DELETE_ADMIN_CODE: 'تم حذف كود إدارة',
  ACTIVATE_ADMIN_CODE: 'تم تفعيل كود إدارة',
  DEACTIVATE_ADMIN_CODE: 'تم إيقاف كود إدارة مؤقتًا',
  PRUNE_SECURITY_MONITORING: 'تم تنظيف بيانات المراقبة القديمة',
}

export function activityActionLabelArabic(action: string): string {
  return ACTIVITY_ACTION_LABELS_AR[action] ?? action.replace(/_/g, ' ')
}

/** "النظام" for log rows without a known administrator. */
export function actorLabelArabic(actor: string | null): string {
  if (!actor || actor === 'System') return 'النظام'
  return actor
}

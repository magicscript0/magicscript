import { useCallback, useMemo, useState } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react'
import {
  EmptyState,
  InlineError,
  LoadingRows,
  MetricCard,
  PageHeader,
  PanelHeading,
  StatusBadge,
} from '../components/AdminPrimitives'
import { useMonitoringFeed } from '../hooks/useMonitoringFeed'
import {
  MONITORING_RANGE_OPTIONS,
  SEVERITY_LABELS,
  TRACKED_PATH_LABELS,
  getMonitoringSummary,
  listSecurityEvents,
  reasonLabel,
  securityEventLabel,
  severityTone,
  visitorShortLabel,
  type MonitoringRange,
} from '../services/securityMonitoring'
import { deviceLabelArabic, formatDateTimeArabic, formatTimeArabic, relativeTimeArabic } from '../i18n/dashboard'
import type { SecurityEventRow, SecurityEventResult, SecurityEventType, SecuritySeverity, VisitorDeviceType } from '../types/supabase'

interface AuthFeed {
  events: SecurityEventRow[]
  summary: Awaited<ReturnType<typeof getMonitoringSummary>>
}

/** Only authentication-relevant events are shown on this page. */
const AUTH_EVENT_TYPES: readonly SecurityEventType[] = [
  'game_login_success',
  'game_login_failure',
  'game_access_expired',
  'game_access_revoked',
  'game_logout',
  'admin_login_success',
  'admin_login_failure',
  'admin_logout',
]

const EVENT_TYPE_OPTIONS: ReadonlyArray<{ value: SecurityEventType; label: string }> = [
  { value: 'game_login_success', label: 'دخول اللعبة — نجح' },
  { value: 'game_login_failure', label: 'دخول اللعبة — فشل' },
  { value: 'game_access_expired', label: 'محاولة دخول بكود منتهي' },
  { value: 'game_access_revoked', label: 'محاولة دخول بكود ملغي' },
  { value: 'game_logout', label: 'خروج من اللعبة' },
  { value: 'admin_login_success', label: 'دخول لوحة التحكم — نجح' },
  { value: 'admin_login_failure', label: 'دخول لوحة التحكم — فشل' },
  { value: 'admin_logout', label: 'خروج من لوحة التحكم' },
]

function resultTone(result: SecurityEventResult): 'success' | 'danger' | 'neutral' {
  if (result === 'success') return 'success'
  if (result === 'failure') return 'danger'
  return 'neutral'
}

const RESULT_LABELS_AR: Record<SecurityEventResult, string> = {
  success: 'نجاح',
  failure: 'فشل',
  info: 'معلومات',
}

/**
 * نشاط تسجيل الدخول — هنا بتشوف محاولات تسجيل الدخول الناجحة والفاشلة
 * من النظامين القائمين (دخول الإدارة + أكواد دخول اللاعبين). كل سطر
 * يعرض النتيجة وفئة الفشل فقط — لا تُسجل أي كلمة مرور أو كود مُدخل.
 */
export function AuthActivityPage() {
  const [range, setRange] = useState<MonitoringRange>('24h')
  const [result, setResult] = useState<SecurityEventResult | 'all'>('all')
  const [eventType, setEventType] = useState<SecurityEventType | 'all'>('all')
  const [country, setCountry] = useState<string>('all')
  const [device, setDevice] = useState<VisitorDeviceType | 'all'>('all')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [search, setSearch] = useState('')

  const refreshKey = JSON.stringify({ range, result, eventType, country, device, flaggedOnly, search })
  const loader = useCallback(async (): Promise<AuthFeed> => {
    const [rows, summary] = await Promise.all([
      listSecurityEvents({
        range,
        result,
        eventType,
        severity: flaggedOnly ? 'flagged' : 'all',
        country,
        device,
        search,
        limit: 200,
      }),
      getMonitoringSummary(),
    ])
    // This section is scoped to authentication events; session/page events
    // live in the Visitor Activity timeline instead.
    return { events: rows.filter((row) => AUTH_EVENT_TYPES.includes(row.event_type)), summary }
  }, [range, result, eventType, country, device, flaggedOnly, search])

  const feed = useMonitoringFeed<AuthFeed>(loader, refreshKey)
  const events = useMemo(() => feed.data?.events ?? [], [feed.data])
  const summary = feed.data?.summary

  const countries = useMemo(
    () => [...new Set(events.map((event) => event.country_code).filter((value): value is string => value !== null))].sort(),
    [events],
  )
  const devices = useMemo(
    () => [...new Set(events.map((event) => event.device_type).filter((value): value is VisitorDeviceType => value !== null && value !== 'unknown'))].sort(),
    [events],
  )

  return <>
    <PageHeader
      eyebrow="المراقبة / نشاط تسجيل الدخول"
      title="نشاط تسجيل الدخول"
      description="هنا بتشوف محاولات تسجيل الدخول الناجحة والفاشلة من النظامين الحاليين: دخول الإدارة ودخول اللاعبين بالأكواد. الفشل بيتسجل كفئات فقط — لا تُسجل أي كلمات مرور أو أكواد مُدخلة في أي مكان."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> تحديث</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="محاولات ناجحة" value={summary ? String(summary.successfulLogins) : '—'} detail="آخر 24 ساعة (النظامان معًا)" icon={ShieldCheck} tone="green" loading={feed.loading && !summary} />
      <MetricCard label="محاولات فاشلة" value={summary ? String(summary.failedLogins) : '—'} detail="آخر 24 ساعة (النظامان معًا)" icon={KeyRound} tone="amber" loading={feed.loading && !summary} />
      <MetricCard label="محاولات مريبة" value={summary ? String(summary.flaggedEvents) : '—'} detail="بدرجة تحذير أو أعلى (24 ساعة)" icon={ShieldQuestion} tone="cyan" loading={feed.loading && !summary} />
      <MetricCard label="الأحداث المعروضة" value={String(events.length)} detail={`${MONITORING_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? ''} · الأحدث أولًا`} icon={KeyRound} tone="slate" loading={feed.loading && events.length === 0} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <section className="panel p-0">
      <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
        <PanelHeading
          icon={KeyRound}
          title="أحداث تسجيل الدخول"
          description="الحدث، الزائر، الحساب إن وجد، النتيجة، سبب الفشل، وعدد المحاولات الفاشلة الأخيرة."
          action={<StatusBadge label={feed.live ? 'مباشر' : 'تحديث تلقائي كل 45 ثانية'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="field-label mb-0">المدة</span>
            <select className="select h-10 text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="التصفية حسب المدة">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">النتيجة</span>
            <select className="select h-10 text-xs" value={result} onChange={(event) => setResult(event.target.value as SecurityEventResult | 'all')} aria-label="التصفية حسب النتيجة">
              <option value="all">الناجحة والفاشلة</option>
              <option value="success">ناجحة فقط</option>
              <option value="failure">فاشلة فقط</option>
              <option value="info">معلوماتية فقط</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">نوع الحدث</span>
            <select className="select h-10 text-xs" value={eventType} onChange={(event) => setEventType(event.target.value as SecurityEventType | 'all')} aria-label="التصفية حسب نوع الحدث">
              <option value="all">كل الأنواع</option>
              {EVENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">الدولة</span>
            <select className="select h-10 text-xs" value={country} onChange={(event) => setCountry(event.target.value)} aria-label="التصفية حسب الدولة">
              <option value="all">كل الدول</option>
              {countries.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">الجهاز</span>
            <select className="select h-10 text-xs" value={device} onChange={(event) => setDevice(event.target.value as VisitorDeviceType | 'all')} aria-label="التصفية حسب نوع الجهاز">
              <option value="all">كل الأجهزة</option>
              {devices.map((value) => <option key={value} value={value}>{deviceLabelArabic(value)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">بحث</span>
            <input className="input mono h-10 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مفتاح الزائر أو رقم الحساب" aria-label="البحث في الأحداث" />
          </label>
          <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-xs text-slate-400">
            <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} aria-label="عرض النشاط المريب فقط" />
            المريبة فقط
          </label>
        </div>
      </div>

      {feed.loading && events.length === 0 ? <div className="p-4 sm:p-5"><LoadingRows count={7} /></div> : events.length === 0 ? (
        <EmptyState icon={KeyRound} title="لا توجد أحداث في هذه المدة" description="عمليات دخول الإدارة وتفعيل أكواد اللعبة بتظهر هنا مع نتيجتها وسبب الفشل إن وجد." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-[10px] font-bold tracking-normal text-slate-500">
                <th className="px-4 py-3 sm:px-5">الوقت</th>
                <th className="px-4 py-3">الحدث</th>
                <th className="px-4 py-3">الزائر</th>
                <th className="px-4 py-3">الحساب / المستخدم</th>
                <th className="px-4 py-3">الدولة</th>
                <th className="px-4 py-3">الجهاز</th>
                <th className="px-4 py-3">النتيجة</th>
                <th className="px-4 py-3">السبب</th>
                <th className="px-4 py-3">محاولات فاشلة أخيرة</th>
                <th className="px-4 py-3 sm:px-5">الدرجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.05]">
              {events.map((event) => <AuthEventRow key={event.id} event={event} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-xs leading-5 text-emerald-100">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <p>لم يتم تعديل أي من نظامي الدخول: الأحداث بتتسجل حول التدفقات القائمة فقط. الحدث الفاشل بيخزن فئة الفشل فقط (مثل «كود غير صحيح») وعدد المحاولات الفاشلة الأخيرة — كلمة المرور أو كود الدخول المُدخل لا يُرسل ولا يُخزن ولا يُعرض أبدًا. {events.some((event) => event.path) ? `سياق الصفحة: ${[...new Set(events.map((event) => event.path).filter(Boolean).map((path) => TRACKED_PATH_LABELS[path as string] ?? path))].join('، ')}.` : ''}</p>
    </div>
  </>
}

function AuthEventRow({ event }: { event: SecurityEventRow }) {
  const deviceText = [event.device_type && event.device_type !== 'unknown' ? deviceLabelArabic(event.device_type) : null, event.browser, event.os]
    .filter((value): value is string => value !== null)
    .join(' · ') || '—'
  return (
    <tr className="transition hover:bg-white/[.03]">
      <td className="whitespace-nowrap px-4 py-3 text-slate-500 sm:px-5" title={formatDateTimeArabic(event.created_at)}>
        <span className="ltr-island mono">{formatTimeArabic(event.created_at)}</span>
        <span className="ms-2 text-[10px]">{relativeTimeArabic(event.created_at)}</span>
      </td>
      <td className="px-4 py-3 font-semibold text-slate-200">{securityEventLabel(event)}</td>
      <td className="ltr-island mono px-4 py-3 text-emerald-200">{visitorShortLabel(event.visitor_key)}</td>
      <td className="ltr-island mono px-4 py-3 text-slate-400">
        {event.game_account_id ?? (event.user_id ? <span title={event.user_id}>مستخدم {event.user_id.slice(0, 8)}…</span> : '—')}
      </td>
      <td className="ltr-island mono px-4 py-3 text-slate-300">{event.country_code ?? '—'}</td>
      <td className="px-4 py-3 text-slate-400"><span className="ltr-island">{deviceText}</span></td>
      <td className="px-4 py-3"><StatusBadge label={RESULT_LABELS_AR[event.result]} tone={resultTone(event.result)} /></td>
      <td className="px-4 py-3 text-slate-400">{reasonLabel(event.reason) ?? '—'}</td>
      <td className={`mono px-4 py-3 ${event.recent_failure_count >= 4 ? 'font-semibold text-rose-300' : event.recent_failure_count >= 2 ? 'text-amber-300' : 'text-slate-500'}`}>{event.recent_failure_count}</td>
      <td className="px-4 py-3 sm:px-5"><StatusBadge label={SEVERITY_LABELS[event.severity as SecuritySeverity]} tone={severityTone(event.severity)} pulse={event.severity === 'high_risk'} /></td>
    </tr>
  )
}

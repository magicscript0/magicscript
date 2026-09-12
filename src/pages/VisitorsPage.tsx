import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, Eye, Radar, RefreshCw, ShieldCheck, Users, Wifi } from 'lucide-react'
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
  getVisitorTimeline,
  listVisitorSessions,
  securityEventLabel,
  severityTone,
  visitorPresence,
  visitorShortLabel,
  type MonitoringRange,
  type VisitorPresence,
} from '../services/securityMonitoring'
import { deviceLabelArabic, formatDateTimeArabic, formatTimeArabic, PRESENCE_LABELS_AR, reasonLabelArabic, relativeTimeArabic } from '../i18n/dashboard'
import type { SecurityEventRow, VisitorSessionRow } from '../types/supabase'

interface VisitorsFeed {
  visitors: VisitorSessionRow[]
  summary: Awaited<ReturnType<typeof getMonitoringSummary>>
}

function presenceTone(presence: VisitorPresence): 'success' | 'info' | 'neutral' {
  if (presence === 'online') return 'success'
  if (presence === 'recent') return 'info'
  return 'neutral'
}

/**
 * نشاط الزوار — زوار الموقع ولوحة التحكم بمعرّفات عشوائية.
 *
 * Shows only privacy-safe technical metadata (random visitor key, coarse
 * country, device family, browser/OS family, app path, counters). No IP
 * addresses, no fingerprints, and no credentials exist in this data path.
 */
export function VisitorsPage() {
  const [range, setRange] = useState<MonitoringRange>('24h')
  const [presence, setPresence] = useState<VisitorPresence | 'all'>('all')
  const [device, setDevice] = useState<string>('all')
  const [country, setCountry] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const refreshKey = JSON.stringify({ range, presence, device, country, search })
  const loader = useCallback(async (): Promise<VisitorsFeed> => {
    const [visitors, summary] = await Promise.all([
      listVisitorSessions({
        range,
        presence,
        device: device as VisitorSessionRow['device_type'] | 'all',
        country,
        search,
        limit: 150,
      }),
      getMonitoringSummary(),
    ])
    return { visitors, summary }
  }, [range, presence, device, country, search])

  const feed = useMonitoringFeed<VisitorsFeed>(loader, refreshKey)
  const visitors = useMemo(() => feed.data?.visitors ?? [], [feed.data])
  const summary = feed.data?.summary

  const countries = useMemo(
    () => [...new Set(visitors.map((visitor) => visitor.country_code).filter((value): value is string => value !== null))].sort(),
    [visitors],
  )
  const devices = useMemo(
    () => [...new Set(visitors.map((visitor) => visitor.device_type).filter((value) => value !== 'unknown'))].sort(),
    [visitors],
  )
  const selected = useMemo(() => visitors.find((visitor) => visitor.visitor_key === selectedKey) ?? null, [visitors, selectedKey])

  return <>
    <PageHeader
      eyebrow="المراقبة / الزوار"
      title="نشاط الزوار"
      description="هنا تقدر تشوف حركة الزوار بشكل تقريبي من غير تخزين بيانات شخصية حساسة: آخر ظهور، الدولة التقريبية، ونوع الجهاز — بمفاتيح عشوائية فقط بدون عناوين IP أو بصمات."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> تحديث</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="الزوار المتصلون" value={summary ? String(summary.visitorsOnline) : '—'} detail="نشطون خلال آخر 5 دقائق" icon={Wifi} tone="green" loading={feed.loading && !summary} />
      <MetricCard label="الجلسات النشطة" value={summary ? String(summary.activeSessions) : '—'} detail="ظهرت خلال آخر 30 دقيقة" icon={Radar} tone="cyan" loading={feed.loading && !summary} />
      <MetricCard label="زوار اليوم" value={summary ? String(summary.visitorsToday) : '—'} detail="منذ منتصف الليل (توقيت UTC)" icon={Users} tone="slate" loading={feed.loading && !summary} />
      <MetricCard label="أحداث تحتاج مراجعة" value={summary ? String(summary.flaggedEvents) : '—'} detail="بدرجة تحذير أو أعلى (24 ساعة)" icon={ShieldCheck} tone="amber" loading={feed.loading && !summary} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <section className="panel p-0">
      <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
        <PanelHeading
          icon={Radar}
          title="الزوار"
          description="الأحدث أولًا. اضغط على أي زائر لفتح سجل نشاطه بالترتيب."
          action={<StatusBadge label={feed.live ? 'مباشر' : 'تحديث تلقائي كل 45 ثانية'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1"><span className="field-label mb-0">المدة</span>
            <select className="select h-10 text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="التصفية حسب المدة">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">الحالة</span>
            <select className="select h-10 text-xs" value={presence} onChange={(event) => setPresence(event.target.value as VisitorPresence | 'all')} aria-label="التصفية حسب حالة الجلسة">
              <option value="all">كل الحالات</option>
              <option value="online">متصل الآن</option>
              <option value="recent">نشط مؤخرًا</option>
              <option value="offline">غير متصل</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">الدولة</span>
            <select className="select h-10 text-xs" value={country} onChange={(event) => setCountry(event.target.value)} aria-label="التصفية حسب الدولة">
              <option value="all">كل الدول</option>
              {countries.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">الجهاز</span>
            <select className="select h-10 text-xs" value={device} onChange={(event) => setDevice(event.target.value)} aria-label="التصفية حسب نوع الجهاز">
              <option value="all">كل الأجهزة</option>
              {devices.map((value) => <option key={value} value={value}>{deviceLabelArabic(value)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">بحث</span>
            <input className="input mono h-10 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مفتاح الزائر أو رقم الحساب" aria-label="البحث في الزوار" />
          </label>
        </div>
      </div>

      {feed.loading && visitors.length === 0 ? <div className="p-4 sm:p-5"><LoadingRows count={6} /></div> : visitors.length === 0 ? (
        <EmptyState icon={Radar} title="لا يوجد زوار في هذه المدة" description="زوار اللعبة العامة ومنطقة الإدارة بيظهروا هنا مع بيانات تقنية آمنة للخصوصية." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-[10px] font-bold tracking-normal text-slate-500">
                <th className="px-4 py-3 sm:px-5">الزائر</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">الدولة</th>
                <th className="px-4 py-3">الجهاز</th>
                <th className="px-4 py-3">آخر صفحة</th>
                <th className="px-4 py-3">الجلسات</th>
                <th className="px-4 py-3">دخول ناجح / فاشل</th>
                <th className="px-4 py-3 sm:px-5">أول ظهور</th>
                <th className="px-4 py-3 sm:px-5">آخر نشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.05]">
              {visitors.map((visitor) => <VisitorRow key={visitor.id} visitor={visitor} selected={visitor.visitor_key === selectedKey} onSelect={setSelectedKey} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {selected && <VisitorTimeline visitor={selected} onClose={() => setSelectedKey(null)} />}

    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-xs leading-5 text-emerald-100">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <p>الخصوصية مضمونة بالتصميم: مفاتيح الزوار عشوائية بتتولد في المتصفح، والدول تقريبية، ومصادر الزيارات بتتسجل كأسماء نطاقات فقط — ولا يتم تسجيل أي كلمات مرور أو توكنات أو كوكيز أو عناوين IP. القراءة تتطلب حساب إدارة نشط (مفروضة من قاعدة البيانات).</p>
    </div>
  </>
}

function VisitorRow({ visitor, selected, onSelect }: { visitor: VisitorSessionRow; selected: boolean; onSelect: (key: string) => void }) {
  const presence = visitorPresence(visitor.last_seen_at)
  const deviceText = [visitor.browser, visitor.os].filter((value): value is string => value !== null).join(' · ') || '—'
  return (
    <tr
      className={`cursor-pointer transition hover:bg-white/[.03] ${selected ? 'bg-emerald-300/[.06]' : ''}`}
      onClick={() => onSelect(visitor.visitor_key)}
      aria-selected={selected}
    >
      <td className="px-4 py-3 sm:px-5">
        <span className="ltr-island mono font-semibold text-emerald-200">{visitorShortLabel(visitor.visitor_key)}</span>
        <span className="ltr-island mono ms-2 hidden text-[10px] text-slate-600 lg:inline" title={visitor.visitor_key}>{visitor.visitor_key.slice(0, 13)}…</span>
        {visitor.game_account_id && <span className="ltr-island mono ms-2 rounded border border-white/[.08] px-1.5 py-0.5 text-[10px] text-slate-400">حساب {visitor.game_account_id}</span>}
        {visitor.user_id && <span className="ms-2 rounded border border-cyan-300/20 bg-cyan-300/[.07] px-1.5 py-0.5 text-[10px] text-cyan-200" title={visitor.user_id}>مستخدم مسجّل الدخول</span>}
      </td>
      <td className="px-4 py-3"><StatusBadge label={PRESENCE_LABELS_AR[presence]} tone={presenceTone(presence)} pulse={presence === 'online'} /></td>
      <td className="ltr-island mono px-4 py-3 text-slate-300">{visitor.country_code ?? '—'}</td>
      <td className="px-4 py-3 text-slate-300">{deviceLabelArabic(visitor.device_type)}{deviceText !== '—' && <span className="ltr-island block text-[10px] text-slate-600">{deviceText}</span>}</td>
      <td className="px-4 py-3 text-slate-300">{visitor.last_path ? (TRACKED_PATH_LABELS[visitor.last_path] ?? visitor.last_path) : '—'}{visitor.referrer_host && <span className="ltr-island block text-[10px] text-slate-600">عبر {visitor.referrer_host}</span>}</td>
      <td className="mono px-4 py-3 text-slate-300">{visitor.session_count}</td>
      <td className="mono px-4 py-3"><span className="text-emerald-300">{visitor.login_success_count}</span> <span className="text-slate-600">/</span> <span className={visitor.login_failure_count > 0 ? 'text-amber-300' : 'text-slate-600'}>{visitor.login_failure_count}</span></td>
      <td className="px-4 py-3 text-slate-500 sm:px-5" title={formatDateTimeArabic(visitor.first_seen_at)}>{relativeTimeArabic(visitor.first_seen_at)}</td>
      <td className="px-4 py-3 text-slate-300 sm:px-5" title={formatDateTimeArabic(visitor.last_seen_at)}>{relativeTimeArabic(visitor.last_seen_at)}</td>
    </tr>
  )
}

function VisitorTimeline({ visitor, onClose }: { visitor: VisitorSessionRow; onClose: () => void }) {
  const [timeline, setTimeline] = useState<SecurityEventRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTimeline(await getVisitorTimeline(visitor.visitor_key, 150))
      setError(null)
    } catch {
      setError('تعذر تحميل سجل النشاط. قراءة بيانات المراقبة متاحة للمديرين النشطين فقط.')
    } finally {
      setLoading(false)
    }
  }, [visitor.visitor_key])

  // Reload whenever another visitor is selected.
  useEffect(() => { void load() }, [load])

  return (
    <section className="panel mt-5" key={visitor.visitor_key}>
      <PanelHeading
        icon={Clock3}
        title={`الزائر ${visitorShortLabel(visitor.visitor_key)} — سجل النشاط`}
        description={`أول ظهور ${formatDateTimeArabic(visitor.first_seen_at)} · آخر نشاط ${relativeTimeArabic(visitor.last_seen_at)}`}
        action={<div className="flex gap-2"><button type="button" className="btn-ghost text-xs" onClick={() => { void load() }}><RefreshCw className="h-3.5 w-3.5" /> إعادة التحميل</button><button type="button" className="btn-ghost text-xs" onClick={onClose} aria-label="إغلاق سجل النشاط">إغلاق</button></div>}
      />
      {error && <InlineError message={error} onRetry={() => { void load() }} />}
      {loading && timeline === null ? <LoadingRows count={4} /> : timeline === null || timeline.length === 0 ? (
        <EmptyState icon={Eye} title="لا توجد أحداث مسجلة" description="المحطات المهمة (الدخول، فتح الصفحات، محاولات تسجيل الدخول) بتظهر هنا فور حدوثها." />
      ) : (
        <ol className="space-y-1 border-t border-white/[.06] px-2 py-3 sm:px-4">
          {timeline.map((event) => (
            <li key={event.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[.025]">
              <span className="ltr-island mono w-14 shrink-0 text-[11px] text-slate-500">{formatTimeArabic(event.created_at)}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.result === 'success' ? 'bg-emerald-300' : event.result === 'failure' ? 'bg-rose-300' : 'bg-slate-500'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{securityEventLabel(event)}{event.reason ? <span className="ms-2 text-[10px] text-slate-600">({reasonLabelArabic(event.reason)})</span> : null}</span>
              {event.severity !== 'normal' && <StatusBadge label={SEVERITY_LABELS[event.severity]} tone={severityTone(event.severity)} />}
              {event.recent_failure_count > 1 && <span className="mono text-[10px] text-slate-600">{event.recent_failure_count} محاولات فاشلة أخيرة</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

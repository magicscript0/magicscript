import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Gauge,
  Layers3,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react'
import { PageHeader, MetricCard, PanelHeading, StatusBadge, EmptyState, LoadingRows } from '../components/AdminPrimitives'
import { useFirebaseConnection } from '../hooks/useFirebaseConnection'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { useConfiguredOnlineUsers } from '../hooks/useConfiguredOnlineUsers'
import { isSupabaseConfigured } from '../config/supabase'
import { listActivityLogs } from '../services/activity'
import { listAdminCodes, adminCodeStatus } from '../services/adminCodes'
import { listRoundHistory } from '../services/roundHistory'
import { gameAccessCodeStatus, listGameAccessCodes } from '../services/gameAccess'
import { adminErrorMessage, activityActionLabelArabic, actorLabelArabic, CONNECTION_LABELS_AR, formatDateTimeArabic, relativeTimeArabic } from '../i18n/dashboard'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import type { ActivityLogEntry } from '../services/activity'
import type { AdminCodeSummary, AdminRole, GameAccessCodeSummary, RoundHistoryRow } from '../types/supabase'

export function DashboardPage({ adminId, adminRole }: { adminId: string; adminRole: AdminRole }) {
  const { settings } = useSharedControlSettings()
  const connection = useFirebaseConnection()
  const mirror = useM11Mirror()
  const onlineCount = useConfiguredOnlineUsers(settings.display)
  const canManageCodes = adminRole !== 'operator'
  const [accessCodes, setAccessCodes] = useState<GameAccessCodeSummary[]>([])
  const [adminCodes, setAdminCodes] = useState<AdminCodeSummary[]>([])
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [history, setHistory] = useState<RoundHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBridgeDetails, setShowBridgeDetails] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    const codesRequest = canManageCodes ? Promise.all([listGameAccessCodes(), listAdminCodes()]) : Promise.resolve([[], []] as [GameAccessCodeSummary[], AdminCodeSummary[]])
    void Promise.allSettled([codesRequest, listActivityLogs(8), listRoundHistory(8)])
      .then(([codesResult, logsResult, historyResult]) => {
        if (!mounted) return
        if (codesResult.status === 'fulfilled') {
          setAccessCodes(codesResult.value[0])
          setAdminCodes(codesResult.value[1])
        }
        if (logsResult.status === 'fulfilled') setLogs(logsResult.value)
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value)
        const failures = [codesResult, logsResult, historyResult]
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => adminErrorMessage(result.reason, 'تعذر تحميل بعض بيانات لوحة التحكم.'))
        setError(failures.length > 0 ? [...new Set(failures)].join(' ') : null)
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [adminId, adminRole, canManageCodes])

  const now = Date.now()
  const activeAccess = useMemo(() => accessCodes.filter((code) => gameAccessCodeStatus(code, now) === 'active').length, [accessCodes, now])
  const waitingAccess = useMemo(() => accessCodes.filter((code) => gameAccessCodeStatus(code, now) === 'inactive' && code.active).length, [accessCodes, now])
  const closedAccess = useMemo(() => accessCodes.filter((code) => ['expired', 'revoked'].includes(gameAccessCodeStatus(code, now))).length, [accessCodes, now])
  const activeAdminCodes = useMemo(() => adminCodes.filter((code) => adminCodeStatus(code) === 'active').length, [adminCodes])
  const expiringAdminCodes = useMemo(() => adminCodes.filter((code) => {
    if (!code.expires_at || adminCodeStatus(code) !== 'active') return false
    return Date.parse(code.expires_at) - Date.now() < 1000 * 60 * 60 * 24 * 3
  }).length, [adminCodes])

  const lastPublished = history.find((item) => item.source === 'published')

  // حالة الربط: شغال = متصل + بيانات متزامنة.
  const bridgeHealthy = connection === 'connected' && mirror.status === 'valid'
  const bridgeConnecting = connection === 'connecting' || mirror.status === 'syncing'
  const bridgeLabel = bridgeHealthy ? 'الربط شغال' : bridgeConnecting ? 'جارٍ الاتصال' : 'يحتاج مراجعة'
  const bridgeTone: 'success' | 'warning' | 'danger' = bridgeHealthy ? 'success' : bridgeConnecting ? 'warning' : 'danger'
  const mirrorStatusLabel = mirror.status === 'valid' ? 'البيانات متزامنة (50/50)' : mirror.status === 'syncing' ? 'جارٍ المزامنة…' : mirror.status === 'empty' ? 'لا توجد بيانات بعد' : mirror.status === 'incomplete' ? 'البيانات غير مكتملة' : mirror.status === 'invalid' ? 'البيانات تحتاج مراجعة' : mirror.status === 'error' ? 'خطأ في المزامنة' : 'غير مرتبط'

  return (
    <>
      <PageHeader
        eyebrow="لوحة التحكم / نظرة عامة"
        title="أهلًا بك في مركز التحكم."
        description="من هنا تقدر تعرف حالة النظام في ثواني: الربط، الجولة الحالية، الأكواد، وآخر النشاط."
        action={<button type="button" className="btn-ghost" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> تحديث</button>}
      />

      {settings.general.announcement && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-sm text-cyan-100">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <span>{settings.general.announcement}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="حالة النظام" value="شغال تمام" detail="لا توجد مشاكل حالية" icon={ShieldCheck} tone="green" />
        <MetricCard label="حالة الربط" value={bridgeLabel} detail={bridgeHealthy ? 'البيانات متزامنة' : mirrorStatusLabel} icon={Radio} tone={bridgeHealthy ? 'green' : bridgeConnecting ? 'cyan' : 'amber'} />
        <MetricCard label="الجولة الحالية" value={lastPublished ? 'منشورة' : 'لا توجد'} detail={lastPublished ? `آخر تحديث ${relativeTimeArabic(lastPublished.created_at)}` : 'لم تُنشر جولات بعد'} icon={Gauge} tone={lastPublished ? 'cyan' : 'slate'} />
        <MetricCard label="عدد المتصلين الظاهر" value={onlineCount === null ? 'مخفي' : onlineCount.toLocaleString('en-US')} detail={settings.display.onlineCountMode === 'random' ? 'قيمة عرض متغيرة' : 'قيمة عرض ثابتة'} icon={Users} tone="slate" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="panel">
          <PanelHeading
            icon={Radio}
            title="حالة الربط"
            description="مراقبة قراءة فقط لجسر الجولات الحالي — بدون أي تعديل."
            action={<StatusBadge label={bridgeLabel} tone={bridgeTone} pulse={bridgeHealthy} />}
          />
          <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${bridgeHealthy ? 'border-emerald-300/20 bg-emerald-300/[.06] text-emerald-100' : bridgeConnecting ? 'border-amber-300/20 bg-amber-300/[.05] text-amber-100' : 'border-rose-300/20 bg-rose-300/[.05] text-rose-100'}`}>
            <Radio className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-6">{bridgeHealthy ? 'الربط شغال والبيانات متزامنة. كل حاجة تمام.' : bridgeConnecting ? 'جارٍ الاتصال بالجسر — ثواني ويظهر كل شيء.' : 'يوجد ما يحتاج مراجعة في الربط. افتح التفاصيل لمعرفة السبب.'}</p>
          </div>

          <button
            type="button"
            onClick={() => setShowBridgeDetails((open) => !open)}
            aria-expanded={showBridgeDetails}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBridgeDetails ? 'rotate-180' : ''}`} />
            {showBridgeDetails ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
          </button>

          {showBridgeDetails && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatusTile label="اتصال Firebase" value={CONNECTION_LABELS_AR[connection] ?? connection} tone={connection === 'connected' ? 'success' : 'warning'} />
                <StatusTile label="مزامنة /m11" value={mirrorStatusLabel} tone={mirror.status === 'valid' ? 'success' : 'warning'} />
                <StatusTile label="تحكم Supabase" value={isSupabaseConfigured() ? 'متصل' : 'غير متاح'} tone={isSupabaseConfigured() ? 'success' : 'warning'} />
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-white/[.07] bg-black/10 px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>مسار نشر واحد محمي فقط هو المفعّل.</span>
                <span className="ltr-island mono text-slate-600">/m11 · m1 … m50</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <PanelHeading icon={Clock3} title="الجولة الحالية" description="آخر جولة منشورة من وحدة التحكم." action={<a href="#/history" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">سجل الجولات <ArrowUpRight className="h-3.5 w-3.5" /></a>} />
          {lastPublished ? (
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.05] p-4">
              <div className="flex items-center justify-between gap-2"><StatusBadge label="منشورة" tone="success" /><span className="text-[11px] text-slate-600">{relativeTimeArabic(lastPublished.created_at)}</span></div>
              <p className="ltr-island mono mt-4 truncate text-sm font-semibold text-slate-200">{lastPublished.round_identifier}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTimeArabic(lastPublished.created_at)}</p>
            </div>
          ) : <EmptyState icon={Layers3} title="لا توجد جولات منشورة بعد" description="بعد أول عملية نشر من وحدة التحكم باللعبة ستظهر الجولة هنا." />}
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="panel">
          <PanelHeading icon={Ticket} title="أكواد الدخول" description="أكواد دخول اللعبة حسب حالتها." action={<a href="#/access" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">إدارة <ArrowUpRight className="h-3.5 w-3.5" /></a>} />
          {loading ? <LoadingRows count={2} /> : !canManageCodes ? <p className="text-xs leading-5 text-slate-600">إدارة الأكواد متاحة لأدوار الإدارة فقط.</p> : (
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="نشطة" value={activeAccess} tone="green" />
              <MiniStat label="في انتظار التفعيل" value={waitingAccess} tone="amber" />
              <MiniStat label="منتهية / ملغاة" value={closedAccess} tone="slate" />
            </div>
          )}
          <div className="mt-4 border-t border-white/[.07] pt-3.5">
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">أكواد الإدارة النشطة</span><span className="mono font-semibold text-slate-300">{canManageCodes ? activeAdminCodes : '—'}</span></div>
            <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">تنتهي خلال 3 أيام</span><span className="mono font-semibold text-amber-200">{canManageCodes ? expiringAdminCodes : '—'}</span></div>
          </div>
          {error && <p className="mt-4 text-xs text-amber-200">{error}</p>}
        </section>

        <section className="panel lg:col-span-2">
          <PanelHeading icon={Activity} title="النشاط الأخير" description="آخر الإجراءات المهمة في مساحة العمل." action={<a href="#/logs" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">عرض الكل <ArrowUpRight className="h-3.5 w-3.5" /></a>} />
          {loading ? <LoadingRows count={4} /> : logs.length === 0 ? <EmptyState icon={Activity} title="لا يوجد نشاط بعد" description="إجراءات فريق الإدارة ستظهر هنا أول ما تتم." /> : <div className="space-y-1">{logs.slice(0, 5).map((log) => <ActivityRow key={log.id} log={log} />)}</div>}
        </section>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs leading-5 text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" /> كل الأكواد تُشفَّر قبل حفظها، ولا تظهر أي بيانات سرية في لوحة التحكم.</div>
    </>
  )
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' }) {
  return <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3.5"><div className="flex items-center gap-2 text-xs text-slate-500">{label}</div><p className={`mt-2 truncate text-sm font-semibold ${tone === 'success' ? 'text-emerald-200' : 'text-amber-200'}`}>{value}</p></div>
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone: 'green' | 'amber' | 'slate' }) {
  const classes = tone === 'green' ? 'border-emerald-300/15 bg-emerald-300/[.05]' : tone === 'amber' ? 'border-amber-300/15 bg-amber-300/[.05]' : 'border-white/[.1] bg-white/[.03]'
  return <div className={`rounded-xl border p-3 ${classes}`}><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mono mt-1.5 text-xl font-semibold text-slate-100">{value}</p></div>
}

function ActivityRow({ log }: { log: ActivityLogEntry }) {
  return <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[.025]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[.08] text-cyan-300"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-300">{activityActionLabelArabic(log.action)}</p><p className="mt-0.5 text-[11px] text-slate-600">{actorLabelArabic(log.actorLabel)} · {relativeTimeArabic(log.created_at)}</p></div><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" /></div>
}

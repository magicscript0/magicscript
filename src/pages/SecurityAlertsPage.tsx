import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, DatabaseZap, History, Radar, RefreshCw, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import {
  EmptyState,
  InlineError,
  LoadingRows,
  MetricCard,
  PageHeader,
  PanelHeading,
  StatusBadge,
} from '../components/AdminPrimitives'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast } from '../components/ToastProvider'
import { useMonitoringFeed } from '../hooks/useMonitoringFeed'
import {
  MONITORING_RANGE_OPTIONS,
  SEVERITY_LABELS,
  getVisitorTimeline,
  listSecurityEvents,
  pruneMonitoringData,
  reasonLabel,
  securityEventLabel,
  severityTone,
  visitorShortLabel,
  type MonitoringRange,
} from '../services/securityMonitoring'
import { recordActivity } from '../services/activity'
import { adminErrorMessage, formatTimeArabic, relativeTimeArabic } from '../i18n/dashboard'
import type { AdminProfile, SecurityEventRow, SecuritySeverity } from '../types/supabase'

const SEVERITY_RANK: Record<SecuritySeverity, number> = { normal: 0, warning: 1, suspicious: 2, high_risk: 3 }

interface VisitorAlertGroup {
  visitorKey: string
  severity: SecuritySeverity
  events: SecurityEventRow[]
  failureCount: number
  latestReason: string | null
  targetedAccounts: string[]
  lastAt: string
}

/**
 * التنبيهات الأمنية — أنماط مريبة بيحسبها الخادم من النشاط المتكرر:
 * محاولات دخول فاشلة متكررة من زائر واحد، محاولات متكررة على حساب واحد،
 * سيل محاولات دخول، وطلبات متكررة بسرعة. المحاولة الفاشلة الواحدة
 * لا تُعتبر تنبيهًا أبدًا.
 */
export function SecurityAlertsPage({ admin }: { admin: AdminProfile }) {
  const { success, error: toastError } = useToast()
  const [range, setRange] = useState<MonitoringRange>('24h')
  const [minSeverity, setMinSeverity] = useState<'warning' | 'suspicious' | 'high_risk'>('warning')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmPrune, setConfirmPrune] = useState(false)
  const [pruning, setPruning] = useState(false)

  // minSeverity is applied client-side; only the period refetches.
  const refreshKey = JSON.stringify({ range })
  const loader = useCallback(async () => listSecurityEvents({ range, severity: 'flagged', limit: 300 }), [range])
  const feed = useMonitoringFeed<SecurityEventRow[]>(loader, refreshKey)

  const groups = useMemo<VisitorAlertGroup[]>(() => {
    const rows = feed.data ?? []
    // Plain records instead of a keyed Map: the repository's static write
    // audit (Firebase guard in src/services/m11.test.ts) bans setter-style
    // write tokens in production source, so grouping avoids them entirely.
    const byVisitor: Record<string, SecurityEventRow[]> = {}
    for (const row of rows) {
      const bucket = byVisitor[row.visitor_key]
      if (bucket) bucket.push(row)
      else byVisitor[row.visitor_key] = [row]
    }
    const minimum = SEVERITY_RANK[minSeverity]
    return Object.entries(byVisitor)
      .map(([visitorKey, events]) => {
        const severity = events.reduce<SecuritySeverity>(
          (worst, event) => (SEVERITY_RANK[event.severity] > SEVERITY_RANK[worst] ? event.severity : worst),
          'normal',
        )
        const failures = events.filter((event) => event.result === 'failure')
        return {
          visitorKey,
          severity,
          events,
          failureCount: failures.length,
          latestReason: failures[0]?.reason ?? null,
          targetedAccounts: [...new Set(failures.map((event) => event.game_account_id).filter((value): value is string => value !== null))],
          lastAt: events[0]?.created_at ?? new Date(0).toISOString(),
        }
      })
      .filter((group) => SEVERITY_RANK[group.severity] >= minimum)
      .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] || Date.parse(right.lastAt) - Date.parse(left.lastAt))
  }, [feed.data, minSeverity])

  const severityCounts = useMemo(() => {
    const rows = feed.data ?? []
    return {
      warning: rows.filter((row) => row.severity === 'warning').length,
      suspicious: rows.filter((row) => row.severity === 'suspicious').length,
      highRisk: rows.filter((row) => row.severity === 'high_risk').length,
    }
  }, [feed.data])

  const accountGroups = useMemo(() => {
    const rows = (feed.data ?? []).filter((row) => row.game_account_id !== null && row.result === 'failure')
    const byAccount: Record<string, number> = {}
    for (const row of rows) {
      const account = row.game_account_id as string
      byAccount[account] = (byAccount[account] ?? 0) + 1
    }
    return Object.entries(byAccount)
      .filter(([, count]) => count >= 2)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
  }, [feed.data])

  async function runPrune() {
    setConfirmPrune(false)
    setPruning(true)
    try {
      const result = await pruneMonitoringData(90)
      await recordActivity(admin.id, 'PRUNE_SECURITY_MONITORING', { retention_days: 90, events_deleted: result.eventsDeleted, visitors_deleted: result.visitorsDeleted })
      success(`اكتمل التنظيف: تم حذف ${result.eventsDeleted} حدثًا و ${result.visitorsDeleted} ملف زائر أقدم من 90 يومًا.`)
      await feed.reload()
    } catch (cause) {
      toastError(adminErrorMessage(cause, 'تعذر تنظيف بيانات المراقبة. حاول مرة أخرى.'))
    } finally {
      setPruning(false)
    }
  }

  return <>
    <PageHeader
      eyebrow="المراقبة / التنبيهات الأمنية"
      title="التنبيهات الأمنية"
      description="هنا بتشوف الأنماط المريبة اللي بيكتشفها الخادم تلقائيًا — زي عدد كبير من محاولات الدخول الفاشلة خلال وقت قصير. القرار النهائي دايمًا بمراجعة بشرية، ولا يوجد حظر تلقائي."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> تحديث</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="تحذير" value={String(severityCounts.warning)} detail={`تكرار بسيط · ${MONITORING_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? ''}`} icon={AlertTriangle} tone="amber" loading={feed.loading && feed.data === null} />
      <MetricCard label="مريب" value={String(severityCounts.suspicious)} detail="نشاط متكرر بشكل ملحوظ" icon={ShieldAlert} tone="amber" loading={feed.loading && feed.data === null} />
      <MetricCard label="خطورة عالية" value={String(severityCounts.highRisk)} detail="نشاط متكرر بكثافة" icon={Siren} tone="cyan" loading={feed.loading && feed.data === null} />
      <MetricCard label="زوار مُبلّغ عنهم" value={String(groups.length)} detail={`بدرجة ${SEVERITY_LABELS[minSeverity]} أو أعلى`} icon={Radar} tone="slate" loading={feed.loading && feed.data === null} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
      <section className="panel p-0">
        <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
          <PanelHeading
            icon={ShieldAlert}
            title="الزوار المُبلّغ عنهم"
            description="مجمّعين حسب الزائر؛ اضغط على أي صف لعرض سجله بالترتيب."
            action={<StatusBadge label={feed.live ? 'مباشر' : 'تحديث تلقائي كل 45 ثانية'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
          />
          <div className="flex flex-wrap gap-2">
            <select className="select h-10 w-auto text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="مدة التنبيهات">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="select h-10 w-auto text-xs" value={minSeverity} onChange={(event) => setMinSeverity(event.target.value as typeof minSeverity)} aria-label="الحد الأدنى للدرجة">
              <option value="warning">تحذير فأعلى</option>
              <option value="suspicious">مريب فأعلى</option>
              <option value="high_risk">خطورة عالية فقط</option>
            </select>
          </div>
        </div>

        {feed.loading && feed.data === null ? <div className="p-4 sm:p-5"><LoadingRows count={4} /></div> : groups.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="لا توجد تنبيهات في هذه المدة" description="مفيش زائر وصل لحد التحذير. المحاولة الفاشلة الواحدة طبيعية ولا تُعامل كهجوم أبدًا." />
        ) : (
          <div className="divide-y divide-white/[.06]">
            {groups.map((group) => (
              <AlertGroupRow
                key={group.visitorKey}
                group={group}
                expanded={expanded === group.visitorKey}
                onToggle={() => setExpanded((current) => (current === group.visitorKey ? null : group.visitorKey))}
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-5">
        <section className="panel">
          <PanelHeading icon={History} title="حسابات مستهدفة" description="أرقام الحسابات اللي عليها محاولات فاشلة متكررة في هذه المدة." />
          {accountGroups.length === 0 ? <p className="text-xs leading-5 text-slate-500">لا يوجد حساب مستهدف بشكل متكرر حاليًا.</p> : (
            <ul className="space-y-2">
              {accountGroups.map(([accountId, count]) => (
                <li key={accountId} className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.02] px-3.5 py-2.5">
                  <span className="ltr-island mono text-xs text-slate-300">{accountId}</span>
                  <span className={`mono text-xs font-semibold ${count >= 5 ? 'text-rose-300' : 'text-amber-300'}`}>{count} محاولات فاشلة</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <PanelHeading icon={Radar} title="حدود الاكتشاف" description="بيطبقها الخادم على كل حدث مسجل." />
          <ul className="space-y-2 text-xs leading-5 text-slate-400">
            <li><span className="font-semibold text-slate-300">تحذير</span> — 2–3 محاولات فاشلة من زائر واحد، أو 3+ محاولات على حساب واحد، خلال 15 دقيقة.</li>
            <li><span className="font-semibold text-slate-300">مريب</span> — 4–9 محاولات فاشلة من زائر، أو 5+ على حساب واحد، أو 20+ حدث دخول خلال 15 دقيقة، أو 30+ طلبًا خلال 5 دقائق.</li>
            <li><span className="font-semibold text-slate-300">خطورة عالية</span> — 10+ محاولات فاشلة من زائر، أو 10+ على حساب واحد، أو 40+ حدث دخول خلال 15 دقيقة، أو 60+ طلبًا خلال 5 دقائق.</li>
            <li className="text-slate-500">المحاولة الفاشلة الواحدة بتفضل دايمًا «طبيعي». لا يوجد حظر تلقائي — القرار بيبقى بمراجعة بشرية باستخدام أدوات إلغاء الأكواد الموجودة.</li>
          </ul>
        </section>

        <section className="panel">
          <PanelHeading icon={DatabaseZap} title="الاحتفاظ بالبيانات" description="بيانات قليلة وعمر تخزين محدد." />
          <p className="text-xs leading-5 text-slate-500">بيانات المراقبة محفوظة للأمن التشغيلي فقط. التنظيف بالأسفل بيحذف الأحداث وملفات الزوار غير النشطة منذ أكثر من 90 يومًا، وبيتسجل الإجراء في سجل النشاط.</p>
          <button type="button" className="btn-secondary mt-4" disabled={pruning} onClick={() => setConfirmPrune(true)}>
            {pruning ? 'جارٍ التنظيف…' : 'تنظيف البيانات الأقدم من 90 يوم'}
          </button>
        </section>
      </div>
    </div>

    <ConfirmDialog
      open={confirmPrune}
      title="حذف بيانات المراقبة الأقدم من 90 يوم؟"
      message="الأحداث وملفات الزوار اللي آخر نشاط لها أقدم من 90 يوم هتتحذف نهائيًا. البيانات الحديثة المستخدمة في المراجعة الأمنية هتبقى كما هي."
      confirmLabel="حذف البيانات القديمة"
      danger
      onConfirm={() => { void runPrune() }}
      onCancel={() => setConfirmPrune(false)}
    />
  </>
}

function AlertGroupRow({ group, expanded, onToggle }: { group: VisitorAlertGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <div>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition hover:bg-white/[.03] sm:px-5" onClick={onToggle} aria-expanded={expanded}>
        <StatusBadge label={SEVERITY_LABELS[group.severity]} tone={severityTone(group.severity)} pulse={group.severity === 'high_risk'} />
        <span className="ltr-island mono text-xs font-semibold text-emerald-200">الزائر {visitorShortLabel(group.visitorKey)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
          {group.failureCount} فاشلة / {group.events.length} حدث مُبلّغ
          {group.latestReason ? ` · آخر سبب: ${reasonLabel(group.latestReason)}` : ''}
          {group.targetedAccounts.length > 0 ? ` · ${group.targetedAccounts.length > 1 ? 'الحسابات' : 'الحساب'} ${group.targetedAccounts.join('، ')}` : ''}
        </span>
        <span className="whitespace-nowrap text-[11px] text-slate-600">{relativeTimeArabic(group.lastAt)}</span>
      </button>
      {expanded && <ExpandedTimeline visitorKey={group.visitorKey} />}
    </div>
  )
}

function ExpandedTimeline({ visitorKey }: { visitorKey: string }) {
  const [timeline, setTimeline] = useState<SecurityEventRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const rows = await getVisitorTimeline(visitorKey, 100)
        if (mounted) { setTimeline(rows); setFailed(false) }
      } catch {
        if (mounted) setFailed(true)
      }
    })()
    return () => { mounted = false }
  }, [visitorKey])

  if (failed) return <p className="px-4 pb-4 text-xs text-amber-200 sm:px-5">تعذر تحميل سجل النشاط الآن. حاول مرة أخرى.</p>
  if (timeline === null) return <div className="px-4 pb-4 sm:px-5"><LoadingRows count={2} /></div>

  return (
    <ol className="space-y-1 border-t border-white/[.05] bg-black/10 px-4 py-3 sm:px-5">
      {timeline.map((event) => (
        <li key={event.id} className="flex items-center gap-3 text-xs">
          <span className="ltr-island mono w-14 shrink-0 text-[11px] text-slate-500">{formatTimeArabic(event.created_at)}</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.result === 'success' ? 'bg-emerald-300' : event.result === 'failure' ? 'bg-rose-300' : 'bg-slate-500'}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-slate-300">{securityEventLabel(event)}{event.reason ? <span className="ms-2 text-[10px] text-slate-600">({reasonLabel(event.reason)})</span> : null}</span>
          {event.severity !== 'normal' && <StatusBadge label={SEVERITY_LABELS[event.severity]} tone={severityTone(event.severity)} />}
        </li>
      ))}
    </ol>
  )
}

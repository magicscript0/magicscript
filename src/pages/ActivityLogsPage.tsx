import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, ChevronDown, RefreshCw, ShieldCheck } from 'lucide-react'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, StatusBadge } from '../components/AdminPrimitives'
import { listActivityLogs, type ActivityLogEntry } from '../services/activity'
import { activityActionLabelArabic, actorLabelArabic, adminErrorMessage, formatDateTimeArabic, relativeTimeArabic } from '../i18n/dashboard'

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); try { setLogs(await listActivityLogs(100)); setError(null) } catch (cause) { setError(adminErrorMessage(cause, 'تعذر تحميل سجل النشاط. حاول مرة أخرى.')) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  return <>
    <PageHeader eyebrow="المراقبة / سجل النشاط" title="سجل النشاط" description="سجل دائم بكل إجراءات الإدارة المهمة. لا تُكتب هنا أي أكواد سرية أو كلمات مرور." action={<button type="button" className="btn-ghost" onClick={() => { void load() }}><RefreshCw className="h-4 w-4" /> تحديث</button>} />
    {error && <div className="mb-5"><InlineError message={error} onRetry={() => { void load() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={Activity} title="آخر الأحداث" description="الأحدث بيظهر الأول." action={<StatusBadge label="سجل دائم" tone="success" />} /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={7} /></div> : logs.length === 0 ? <EmptyState icon={Activity} title="لا توجد أحداث بعد" description="عمليات تسجيل الدخول وتعديلات الإعدادات وعمليات اللعبة هتظهر هنا." /> : <div className="divide-y divide-white/[.06]">{logs.map((log) => <LogRow key={log.id} log={log} />)}</div>}</section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-xs leading-5 text-emerald-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p>قواعد الصلاحيات في قاعدة البيانات تسمح للمديرين النشطين بقراءة السجل وإضافة معرّفاتهم فقط — لا يمكن لأي متصفح تعديل السجل أو حذفه.</p></div>
  </>
}

function LogRow({ log }: { log: ActivityLogEntry }) {
  const [showDetails, setShowDetails] = useState(false)
  const metadataEntries = typeof log.metadata === 'object' && log.metadata !== null && !Array.isArray(log.metadata) ? Object.entries(log.metadata) : []
  return <div className="px-4 py-3.5 sm:px-5"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[.07] text-cyan-300"><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold text-slate-300">{activityActionLabelArabic(log.action)}</p><span className="text-[11px] text-slate-600">{relativeTimeArabic(log.created_at)} · {formatDateTimeArabic(log.created_at)}</span></div><p className="mt-1 text-xs text-slate-600">بواسطة: {actorLabelArabic(log.actorLabel)}</p>{metadataEntries.length > 0 && <button type="button" onClick={() => setShowDetails((open) => !open)} aria-expanded={showDetails} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-300"><ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />تفاصيل إضافية</button>}{showDetails && <div className="mt-2 space-y-1 rounded-lg border border-white/[.07] bg-black/10 px-3 py-2">{metadataEntries.map(([key, value]) => <p key={key} className="ltr-island mono text-left text-[11px] text-slate-500">{key}: {String(value)}</p>)}</div>}</div><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400/60" /></div></div>
}

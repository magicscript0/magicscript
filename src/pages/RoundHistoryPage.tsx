import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Database, Eye, Radio, RefreshCw, Rocket } from 'lucide-react'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, StatusBadge } from '../components/AdminPrimitives'
import { listRoundHistory } from '../services/roundHistory'
import { adminErrorMessage, formatDateTimeArabic, ROUND_SOURCE_LABELS_AR, ROUND_STATUS_LABELS_AR, relativeTimeArabic } from '../i18n/dashboard'
import type { RoundHistoryRow } from '../types/supabase'

export function RoundHistoryPage() {
  const [records, setRecords] = useState<RoundHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRecords(await listRoundHistory()); setError(null) } catch (cause) { setError(adminErrorMessage(cause, 'تعذر تحميل سجل الجولات. حاول مرة أخرى.')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <>
    <PageHeader eyebrow="التشغيل / سجل الجولات" title="سجل الجولات" description="هنا بتشوف أرشيفًا بسيطًا لعمليات الجولات الأخيرة. هذا سجل تشغيلي فقط وليس سجل رهانات." action={<button type="button" className="btn-ghost" onClick={() => { void load() }}><RefreshCw className="h-4 w-4" /> تحديث</button>} />
    {error && <div className="mb-5"><InlineError message={error} onRetry={() => { void load() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={ClipboardList} title="الجولات الأخيرة" description="المصدر والحالة والتاريخ والوقت ومعلومات الجولة." /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={6} /></div> : records.length === 0 ? <EmptyState icon={ClipboardList} title="لا توجد جولات بعد" description="عندما يتم تحميل جولة أو نشرها، بتتسجل معلوماتها هنا تلقائيًا." /> : <div className="table-wrap rounded-t-none border-x-0 border-b-0"><table className="data-table"><thead><tr><th>الجولة</th><th>المصدر</th><th>الحالة</th><th>التاريخ والوقت</th><th>معلومات الجولة</th></tr></thead><tbody className="divide-y divide-white/[.06]">{records.map((record) => <HistoryRow key={record.id} record={record} />)}</tbody></table></div>}</section>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><InfoCard icon={Database} title="سجل تحكم" copy="بيتحفظ في Supabase لأغراض التتبع والمراجعة." /><InfoCard icon={Radio} title="الجسر بدون تغيير" copy="عقد Firebase /m11 لا يُعاد كتابته هنا إطلاقًا." /><InfoCard icon={Eye} title="بيانات آمنة" copy="لا يتم تسجيل أي بيانات اعتماد أو أكواد سرية." /></div>
  </>
}

function HistoryRow({ record }: { record: RoundHistoryRow }) {
  const sourceIcon = record.source === 'published' ? Rocket : record.source === 'live' ? Radio : Database
  const tone = record.status === 'failed' ? 'danger' : record.status === 'revealed' ? 'success' : 'info'
  const metadata = typeof record.metadata === 'object' && record.metadata !== null && !Array.isArray(record.metadata) ? record.metadata : {}
  const safeCount = typeof metadata.safeCount === 'number' ? `${metadata.safeCount} خلية آمنة` : 'تم تسجيل البيانات'
  const Icon = sourceIcon
  return <tr><td><span className="ltr-island mono text-xs font-semibold text-slate-300">{record.round_identifier}</span></td><td><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Icon className="h-3.5 w-3.5 text-cyan-300" />{ROUND_SOURCE_LABELS_AR[record.source] ?? record.source}</span></td><td><StatusBadge label={ROUND_STATUS_LABELS_AR[record.status] ?? record.status} tone={tone} /></td><td className="whitespace-nowrap text-xs text-slate-500">{formatDateTimeArabic(record.created_at)}<span className="ms-2 text-slate-700">{relativeTimeArabic(record.created_at)}</span></td><td className="text-xs text-slate-500">{safeCount}</td></tr>
}

function InfoCard({ icon: Icon, title, copy }: { icon: typeof Database; title: string; copy: string }) { return <div className="panel-muted flex items-start gap-3 p-4"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-xs font-semibold text-slate-300">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{copy}</p></div></div> }

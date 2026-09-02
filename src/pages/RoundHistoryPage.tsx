import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Database, Eye, Radio, RefreshCw, Rocket } from 'lucide-react'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, StatusBadge } from '../components/AdminPrimitives'
import { listRoundHistory } from '../services/roundHistory'
import type { RoundHistoryRow } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

export function RoundHistoryPage() {
  const [records, setRecords] = useState<RoundHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRecords(await listRoundHistory()); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Round history could not be loaded.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <>
    <PageHeader eyebrow="Operations / audit trail" title="Round history" description="Review non-sensitive metadata around the existing game bridge. This is an operational record, not a betting ledger." action={<button type="button" className="btn-ghost" onClick={() => { void load() }}><RefreshCw className="h-4 w-4" /> Refresh</button>} />
    {error && <div className="mb-5"><InlineError message={error} onRetry={() => { void load() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={ClipboardList} title="Recent rounds" description="Source, status, timestamp, and safe operational metadata." /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={6} /></div> : records.length === 0 ? <EmptyState icon={ClipboardList} title="No round history" description="When a round is loaded or published, its metadata will be recorded here." /> : <div className="table-wrap rounded-t-none border-x-0 border-b-0"><table className="data-table"><thead><tr><th>Round</th><th>Source</th><th>Status</th><th>Created</th><th>Metadata</th></tr></thead><tbody className="divide-y divide-white/[.06]">{records.map((record) => <HistoryRow key={record.id} record={record} />)}</tbody></table></div>}</section>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><InfoCard icon={Database} title="Control record" copy="Stored in Supabase for traceability." /><InfoCard icon={Radio} title="Bridge unchanged" copy="The Firebase /m11 contract is not rewritten here." /><InfoCard icon={Eye} title="Safe metadata" copy="No credentials or secret code values are logged." /></div>
  </>
}

function HistoryRow({ record }: { record: RoundHistoryRow }) {
  const sourceIcon = record.source === 'published' ? Rocket : record.source === 'live' ? Radio : Database
  const tone = record.status === 'failed' ? 'danger' : record.status === 'revealed' ? 'success' : 'info'
  const metadata = typeof record.metadata === 'object' && record.metadata !== null && !Array.isArray(record.metadata) ? record.metadata : {}
  const safeCount = typeof metadata.safeCount === 'number' ? `${metadata.safeCount} safe` : 'Metadata recorded'
  return <tr><td><span className="mono text-xs font-semibold text-slate-300">{record.round_identifier}</span></td><td><span className="inline-flex items-center gap-1.5 text-xs text-slate-400">{(() => { const Icon = sourceIcon; return <Icon className="h-3.5 w-3.5 text-cyan-300" /> })()}{record.source}</span></td><td><StatusBadge label={record.status} tone={tone} /></td><td className="whitespace-nowrap text-xs text-slate-500">{new Date(record.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<span className="ml-2 text-slate-700">{formatRelativeTime(record.created_at)}</span></td><td className="text-xs text-slate-500">{safeCount}</td></tr>
}

function InfoCard({ icon: Icon, title, copy }: { icon: typeof Database; title: string; copy: string }) { return <div className="panel-muted flex items-start gap-3 p-4"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-xs font-semibold text-slate-300">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{copy}</p></div></div> }

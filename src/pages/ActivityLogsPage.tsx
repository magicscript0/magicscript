import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clipboard, RefreshCw, ShieldCheck } from 'lucide-react'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, StatusBadge } from '../components/AdminPrimitives'
import { listActivityLogs, type ActivityLogEntry } from '../services/activity'
import { formatRelativeTime } from '../utils/time'

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); try { setLogs(await listActivityLogs(100)); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Activity logs could not be loaded.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  return <>
    <PageHeader eyebrow="Security / audit trail" title="Activity logs" description="An append-only record of important administrator actions. Secret codes and passwords are never written here." action={<button type="button" className="btn-ghost" onClick={() => { void load() }}><RefreshCw className="h-4 w-4" /> Refresh</button>} />
    {error && <div className="mb-5"><InlineError message={error} onRetry={() => { void load() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={Activity} title="Event stream" description="Newest events appear first." action={<StatusBadge label="Append only" tone="success" />} /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={7} /></div> : logs.length === 0 ? <EmptyState icon={Activity} title="No events yet" description="Sign-ins, setting changes, and game operations will appear here." /> : <div className="divide-y divide-white/[.06]">{logs.map((log) => <LogRow key={log.id} log={log} />)}</div>}</section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-xs leading-5 text-emerald-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p>Supabase RLS allows active administrators to read logs and only append their own actor ID. No browser user can edit or delete the audit trail.</p></div>
  </>
}

function LogRow({ log }: { log: ActivityLogEntry }) {
  const metadataText = typeof log.metadata === 'object' && log.metadata !== null && !Array.isArray(log.metadata) ? Object.entries(log.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : ''
  return <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[.07] text-cyan-300"><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold uppercase tracking-[.08em] text-slate-300">{log.action.replace(/_/g, ' ')}</p><span className="text-[11px] text-slate-600">{formatRelativeTime(log.created_at)} · {new Date(log.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-slate-600">Actor: {log.actorLabel}</p>{metadataText && <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-slate-500"><Clipboard className="h-3 w-3 shrink-0" />{metadataText}</p>}</div><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400/60" /></div>
}

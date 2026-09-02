import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  FileKey2,
  Gauge,
  Layers3,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import { useSharedControlSettings } from '../layouts/AdminLayout'
import type { ActivityLogEntry } from '../services/activity'
import type { AdminCodeSummary, RoundHistoryRow } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

export function DashboardPage({ adminId }: { adminId: string }) {
  const { settings } = useSharedControlSettings()
  const connection = useFirebaseConnection()
  const mirror = useM11Mirror()
  const onlineCount = useConfiguredOnlineUsers(settings.display)
  const [codes, setCodes] = useState<AdminCodeSummary[]>([])
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [history, setHistory] = useState<RoundHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    void Promise.allSettled([listAdminCodes(), listActivityLogs(8), listRoundHistory(8)])
      .then(([codesResult, logsResult, historyResult]) => {
        if (!mounted) return
        const failed = [codesResult, logsResult, historyResult].some((result) => result.status === 'rejected')
        if (codesResult.status === 'fulfilled') setCodes(codesResult.value)
        if (logsResult.status === 'fulfilled') setLogs(logsResult.value)
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value)
        setError(failed ? 'Some control data could not be loaded.' : null)
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [adminId])

  const activeCodes = useMemo(() => codes.filter((code) => adminCodeStatus(code) === 'active').length, [codes])
  const expiringCodes = useMemo(() => codes.filter((code) => {
    if (!code.expires_at || adminCodeStatus(code) !== 'active') return false
    return Date.parse(code.expires_at) - Date.now() < 1000 * 60 * 60 * 24 * 3
  }).length, [codes])
  const lastPublished = history.find((item) => item.source === 'published')
  const firebaseLabel = connection === 'connected' && mirror.status === 'valid' ? 'Healthy' : connection === 'connecting' ? 'Connecting' : 'Attention'
  const firebaseTone = firebaseLabel === 'Healthy' ? 'success' : firebaseLabel === 'Connecting' ? 'warning' : 'danger'

  return (
    <>
      <PageHeader
        eyebrow="Command center / overview"
        title="Good morning, operator."
        description="Monitor the control plane, confirm the live bridge, and keep every round operation visible."
        action={<button type="button" className="btn-ghost" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> Refresh</button>}
      />

      {settings.general.announcement && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-sm text-cyan-100">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <span>{settings.general.announcement}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="System status" value="Operational" detail="No active incidents" icon={ShieldCheck} tone="green" />
        <MetricCard label="Firebase bridge" value={firebaseLabel} detail={mirror.status === 'valid' ? '50 / 50 cells in sync' : 'Realtime status monitor'} icon={Radio} tone={firebaseTone === 'success' ? 'green' : 'cyan'} />
        <MetricCard label="Supabase control" value={isSupabaseConfigured() ? 'Connected' : 'Unavailable'} detail="Auth + configuration" icon={Database} tone={isSupabaseConfigured() ? 'cyan' : 'amber'} />
        <MetricCard label="Online display" value={onlineCount === null ? 'Hidden' : onlineCount.toLocaleString()} detail={settings.display.onlineCountMode === 'random' ? 'Configured display value' : 'Fixed display value'} icon={Users} tone="slate" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="panel">
          <PanelHeading icon={Gauge} title="Live bridge status" description="Read-only observation of the existing Firebase /m11 round bridge." action={<StatusBadge label={firebaseLabel} tone={firebaseTone} pulse={firebaseLabel === 'Healthy'} />} />
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile icon={Database} label="Firebase" value={connection === 'connected' ? 'Connected' : connection === 'unconfigured' ? 'Not configured' : connection} tone={connection === 'connected' ? 'success' : 'warning'} />
            <StatusTile icon={Layers3} label="/m11 sync" value={mirror.status === 'valid' ? '50 / 50 valid' : mirror.status === 'syncing' ? 'Syncing' : mirror.status} tone={mirror.status === 'valid' ? 'success' : 'warning'} />
            <StatusTile icon={Bot} label="Consumer" value="APP 2 compatible" tone="info" />
          </div>
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-white/[.07] bg-black/10 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-slate-400"><CircleDot className="h-3.5 w-3.5 text-emerald-300" /> Single guarded publish path is active</div>
            <span className="mono text-slate-600">/m11 · m1 … m50</span>
          </div>
        </section>

        <section className="panel">
          <PanelHeading icon={Clock3} title="Round snapshot" description="Latest control-plane record." />
          {lastPublished ? (
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.05] p-4">
              <div className="flex items-center justify-between gap-2"><StatusBadge label="Published" tone="success" /><span className="text-[11px] text-slate-600">{formatRelativeTime(lastPublished.created_at)}</span></div>
              <p className="mono mt-4 truncate text-sm font-semibold text-slate-200">{lastPublished.round_identifier}</p>
              <p className="mt-1 text-xs text-slate-500">{metadataSummary(lastPublished.metadata)}</p>
            </div>
          ) : <EmptyState icon={Layers3} title="No published rounds yet" description="Published round metadata will appear here after the first Game Console operation." />}
          <div className="mt-4 flex items-center justify-between border-t border-white/[.07] pt-4 text-xs"><span className="text-slate-500">History records</span><span className="mono font-semibold text-slate-300">{history.length}</span></div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <section className="panel">
          <PanelHeading icon={FileKey2} title="Access posture" description="Time-bound admin code inventory." action={<a href="#/codes" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Manage <ArrowUpRight className="h-3.5 w-3.5" /></a>} />
          {loading ? <LoadingRows count={2} /> : <div className="grid grid-cols-2 gap-3"><MiniStat label="Active codes" value={activeCodes} tone="green" /><MiniStat label="Expiring soon" value={expiringCodes} tone="amber" /></div>}
          {error && <p className="mt-4 text-xs text-amber-200">{error}</p>}
          <div className="mt-5 flex items-center gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" /> Codes are hashed before they leave the browser.</div>
        </section>

        <section className="panel">
          <PanelHeading icon={Activity} title="Recent activity" description="The last few workspace events." action={<a href="#/logs" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">View all <ArrowUpRight className="h-3.5 w-3.5" /></a>} />
          {loading ? <LoadingRows count={4} /> : logs.length === 0 ? <EmptyState icon={Activity} title="No activity recorded" description="Admin actions will appear here as the workspace is used." /> : <div className="space-y-1">{logs.slice(0, 5).map((log) => <ActivityRow key={log.id} log={log} />)}</div>}
        </section>
      </div>
    </>
  )
}

function StatusTile({ icon: Icon, label, value, tone }: { icon: typeof Database; label: string; value: string; tone: 'success' | 'warning' | 'info' }) {
  return <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3.5"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className={`h-3.5 w-3.5 ${tone === 'success' ? 'text-emerald-300' : tone === 'info' ? 'text-cyan-300' : 'text-amber-300'}`} />{label}</div><p className="mt-2 truncate text-sm font-semibold text-slate-200">{value}</p></div>
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' }) {
  return <div className={`rounded-xl border p-4 ${tone === 'green' ? 'border-emerald-300/15 bg-emerald-300/[.05]' : 'border-amber-300/15 bg-amber-300/[.05]'}`}><p className="eyebrow">{label}</p><p className="mono mt-2 text-2xl font-semibold text-slate-100">{value}</p></div>
}

function ActivityRow({ log }: { log: ActivityLogEntry }) {
  return <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[.025]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[.08] text-cyan-300"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-300">{log.action.replace(/_/g, ' ')}</p><p className="mt-0.5 text-[11px] text-slate-600">{log.actorLabel} · {formatRelativeTime(log.created_at)}</p></div><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" /></div>
}

function metadataSummary(metadata: RoundHistoryRow['metadata']): string {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return 'Operational record'
  const safe = metadata.safeCount
  return typeof safe === 'number' ? `${safe} safe cells · contract validated` : 'Operational record'
}

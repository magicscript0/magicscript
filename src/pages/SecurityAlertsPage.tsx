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
import { friendlyControlError } from '../services/supabase'
import type { AdminProfile, SecurityEventRow, SecuritySeverity } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

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
 * SECURITY ALERTS — suspicious patterns detected SERVER-SIDE by the
 * tracking RPC (windowed failure counts per visitor and per account,
 * authentication floods, and rapid repeated requests). A single failed
 * login is never flagged; escalation requires repetition.
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
      success(`Retention cleanup finished: ${result.eventsDeleted} events and ${result.visitorsDeleted} visitor profiles older than 90 days were deleted.`)
      await feed.reload()
    } catch (cause) {
      toastError(friendlyControlError(cause, 'Monitoring data could not be pruned.'))
    } finally {
      setPruning(false)
    }
  }

  return <>
    <PageHeader
      eyebrow="Monitoring / security"
      title="Security alerts"
      description="Suspicious patterns computed server-side from windowed activity: repeated failed logins by a visitor, repeated attempts against one account, authentication floods, and rapid repeated requests."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> Refresh</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Warning" value={String(severityCounts.warning)} detail={`Repeated failures · ${MONITORING_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? ''}`} icon={AlertTriangle} tone="amber" loading={feed.loading && feed.data === null} />
      <MetricCard label="Suspicious" value={String(severityCounts.suspicious)} detail="Sustained repeated activity" icon={ShieldAlert} tone="amber" loading={feed.loading && feed.data === null} />
      <MetricCard label="High risk" value={String(severityCounts.highRisk)} detail="Heavy repeated activity" icon={Siren} tone="cyan" loading={feed.loading && feed.data === null} />
      <MetricCard label="Visitors flagged" value={String(groups.length)} detail={`At least ${SEVERITY_LABELS[minSeverity].toLowerCase()} level`} icon={Radar} tone="slate" loading={feed.loading && feed.data === null} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
      <section className="panel p-0">
        <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
          <PanelHeading
            icon={ShieldAlert}
            title="Flagged visitors"
            description="Grouped by pseudonymous visitor; expand a row for its chronological timeline."
            action={<StatusBadge label={feed.live ? 'Live' : 'Auto-refresh 45s'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
          />
          <div className="flex flex-wrap gap-2">
            <select className="select h-10 w-auto text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="Alert period">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="select h-10 w-auto text-xs" value={minSeverity} onChange={(event) => setMinSeverity(event.target.value as typeof minSeverity)} aria-label="Minimum severity">
              <option value="warning">Warning and above</option>
              <option value="suspicious">Suspicious and above</option>
              <option value="high_risk">High risk only</option>
            </select>
          </div>
        </div>

        {feed.loading && feed.data === null ? <div className="p-4 sm:p-5"><LoadingRows count={4} /></div> : groups.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Nothing flagged in this window" description="No visitor reached the warning threshold. A single failed login is normal and is never treated as an attack." />
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
          <PanelHeading icon={History} title="Targeted accounts" description="Game Account IDs with repeated failed attempts in the window." />
          {accountGroups.length === 0 ? <p className="text-xs leading-5 text-slate-500">No account is being targeted repeatedly right now.</p> : (
            <ul className="space-y-2">
              {accountGroups.map(([accountId, count]) => (
                <li key={accountId} className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.02] px-3.5 py-2.5">
                  <span className="mono text-xs text-slate-300">{accountId}</span>
                  <span className={`mono text-xs font-semibold ${count >= 5 ? 'text-rose-300' : 'text-amber-300'}`}>{count} failed attempts</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <PanelHeading icon={Radar} title="Detection thresholds" description="Applied server-side to every recorded event." />
          <ul className="space-y-2 text-xs leading-5 text-slate-400">
            <li><span className="font-semibold text-slate-300">Warning</span> — 2–3 failed attempts by one visitor, or 3+ against one account, within 15 minutes.</li>
            <li><span className="font-semibold text-slate-300">Suspicious</span> — 4–9 visitor failures, 5+ against one account, 20+ authentication events in 15 minutes, or 30+ requests in 5 minutes.</li>
            <li><span className="font-semibold text-slate-300">High risk</span> — 10+ visitor failures, 10+ against one account, 40+ auth events in 15 minutes, or 60+ requests in 5 minutes.</li>
            <li className="text-slate-500">A single failed login always stays “Normal”. No automatic bans are issued; responses remain a human decision using the existing Game Access revocation and admin tools.</li>
          </ul>
        </section>

        <section className="panel">
          <PanelHeading icon={DatabaseZap} title="Retention" description="Minimal data, bounded lifetime." />
          <p className="text-xs leading-5 text-slate-500">Monitoring data is kept for operational security only. The cleanup below deletes events and visitor profiles that have been inactive for more than 90 days. The action is audited in the existing activity log.</p>
          <button type="button" className="btn-secondary mt-4" disabled={pruning} onClick={() => setConfirmPrune(true)}>
            {pruning ? 'Cleaning up…' : 'Run 90-day cleanup'}
          </button>
        </section>
      </div>
    </div>

    <ConfirmDialog
      open={confirmPrune}
      title="Delete monitoring data older than 90 days?"
      message="Events and visitor profiles whose last activity is more than 90 days old are permanently deleted. Recent data used for active security review is kept."
      confirmLabel="Delete old data"
      danger
      onConfirm={() => { void runPrune() }}
      onCancel={() => setConfirmPrune(false)}
    />
  </>
}

function AlertGroupRow({ group, expanded, onToggle }: { group: VisitorAlertGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <div>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[.03] sm:px-5" onClick={onToggle} aria-expanded={expanded}>
        <StatusBadge label={SEVERITY_LABELS[group.severity]} tone={severityTone(group.severity)} pulse={group.severity === 'high_risk'} />
        <span className="mono text-xs font-semibold text-emerald-200">Visitor {visitorShortLabel(group.visitorKey)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
          {group.failureCount} failed / {group.events.length} flagged events
          {group.latestReason ? ` · last: ${reasonLabel(group.latestReason)}` : ''}
          {group.targetedAccounts.length > 0 ? ` · account${group.targetedAccounts.length > 1 ? 's' : ''} ${group.targetedAccounts.join(', ')}` : ''}
        </span>
        <span className="whitespace-nowrap text-[11px] text-slate-600">{formatRelativeTime(group.lastAt)}</span>
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

  if (failed) return <p className="px-4 pb-4 text-xs text-amber-200 sm:px-5">The timeline could not be loaded right now.</p>
  if (timeline === null) return <div className="px-4 pb-4 sm:px-5"><LoadingRows count={2} /></div>

  return (
    <ol className="space-y-1 border-t border-white/[.05] bg-black/10 px-4 py-3 sm:px-5">
      {timeline.map((event) => (
        <li key={event.id} className="flex items-center gap-3 text-xs">
          <span className="mono w-14 shrink-0 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.result === 'success' ? 'bg-emerald-300' : event.result === 'failure' ? 'bg-rose-300' : 'bg-slate-500'}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-slate-300">{securityEventLabel(event)}{event.reason ? <span className="ml-2 text-[10px] text-slate-600">({reasonLabel(event.reason)})</span> : null}</span>
          {event.severity !== 'normal' && <StatusBadge label={SEVERITY_LABELS[event.severity]} tone={severityTone(event.severity)} />}
        </li>
      ))}
    </ol>
  )
}

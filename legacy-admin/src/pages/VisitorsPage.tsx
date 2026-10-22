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
import type { SecurityEventRow, VisitorSessionRow } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

interface VisitorsFeed {
  visitors: VisitorSessionRow[]
  summary: Awaited<ReturnType<typeof getMonitoringSummary>>
}

const PRESENCE_LABELS: Record<VisitorPresence, string> = {
  online: 'Online',
  recent: 'Recently active',
  offline: 'Offline',
}

function presenceTone(presence: VisitorPresence): 'success' | 'info' | 'neutral' {
  if (presence === 'online') return 'success'
  if (presence === 'recent') return 'info'
  return 'neutral'
}

/**
 * VISITOR ACTIVITY — pseudonymous visitors of the public site and admin.
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
      eyebrow="Monitoring / visitors"
      title="Visitor activity"
      description="Pseudonymous visitors of the site: when they were here, from which approximate country, and on what kind of device. Random visitor keys only — no IP addresses, fingerprints, or personal data are stored."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> Refresh</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Visitors online" value={summary ? String(summary.visitorsOnline) : '—'} detail="Active in the last 5 minutes" icon={Wifi} tone="green" loading={feed.loading && !summary} />
      <MetricCard label="Active sessions" value={summary ? String(summary.activeSessions) : '—'} detail="Seen in the last 30 minutes" icon={Radar} tone="cyan" loading={feed.loading && !summary} />
      <MetricCard label="Visitors today" value={summary ? String(summary.visitorsToday) : '—'} detail="Since midnight (UTC)" icon={Users} tone="slate" loading={feed.loading && !summary} />
      <MetricCard label="Flagged events (24h)" value={summary ? String(summary.flaggedEvents) : '—'} detail="Warning level or above" icon={ShieldCheck} tone="amber" loading={feed.loading && !summary} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <section className="panel p-0">
      <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
        <PanelHeading
          icon={Radar}
          title="Visitors"
          description="Newest activity first. Select a visitor to open its chronological timeline."
          action={<StatusBadge label={feed.live ? 'Live' : 'Auto-refresh 45s'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Period</span>
            <select className="select h-10 text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="Filter by period">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Status</span>
            <select className="select h-10 text-xs" value={presence} onChange={(event) => setPresence(event.target.value as VisitorPresence | 'all')} aria-label="Filter by session status">
              <option value="all">Any status</option>
              <option value="online">Online</option>
              <option value="recent">Recently active</option>
              <option value="offline">Offline</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Country</span>
            <select className="select h-10 text-xs" value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Filter by country">
              <option value="all">All countries</option>
              {countries.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Device</span>
            <select className="select h-10 text-xs" value={device} onChange={(event) => setDevice(event.target.value)} aria-label="Filter by device type">
              <option value="all">All devices</option>
              {devices.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Search</span>
            <input className="input mono h-10 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Visitor key or Account ID" aria-label="Search visitors" />
          </label>
        </div>
      </div>

      {feed.loading && visitors.length === 0 ? <div className="p-4 sm:p-5"><LoadingRows count={6} /></div> : visitors.length === 0 ? (
        <EmptyState icon={Radar} title="No visitors in this window" description="Visitors of the public game and the admin area appear here with privacy-safe technical metadata." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-[10px] uppercase tracking-[.12em] text-slate-500">
                <th className="px-4 py-3 sm:px-5">Visitor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Last page</th>
                <th className="px-4 py-3 text-right">Sessions</th>
                <th className="px-4 py-3 text-right">Logins ✓ / ✗</th>
                <th className="px-4 py-3 sm:px-5">First seen</th>
                <th className="px-4 py-3 sm:px-5">Last active</th>
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
      <p>Privacy-safe by design: visitor keys are random UUIDs generated in the browser, locations are approximate country codes, referrers are stored as hostnames only, and no passwords, tokens, cookies, or IP addresses are ever recorded. Reads require an active administrator profile (enforced by Supabase RLS).</p>
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
        <span className="mono font-semibold text-emerald-200">{visitorShortLabel(visitor.visitor_key)}</span>
        <span className="mono ml-2 hidden text-[10px] text-slate-600 lg:inline" title={visitor.visitor_key}>{visitor.visitor_key.slice(0, 13)}…</span>
        {visitor.game_account_id && <span className="mono ml-2 rounded border border-white/[.08] px-1.5 py-0.5 text-[10px] text-slate-400">Acct {visitor.game_account_id}</span>}
        {visitor.user_id && <span className="ml-2 rounded border border-cyan-300/20 bg-cyan-300/[.07] px-1.5 py-0.5 text-[10px] text-cyan-200" title={visitor.user_id}>Signed-in user</span>}
      </td>
      <td className="px-4 py-3"><StatusBadge label={PRESENCE_LABELS[presence]} tone={presenceTone(presence)} pulse={presence === 'online'} /></td>
      <td className="mono px-4 py-3 text-slate-300">{visitor.country_code ?? '—'}</td>
      <td className="px-4 py-3 text-slate-300"><span className="capitalize">{visitor.device_type}</span>{deviceText !== '—' && <span className="block text-[10px] text-slate-600">{deviceText}</span>}</td>
      <td className="px-4 py-3 text-slate-300">{visitor.last_path ? (TRACKED_PATH_LABELS[visitor.last_path] ?? visitor.last_path) : '—'}{visitor.referrer_host && <span className="block text-[10px] text-slate-600">via {visitor.referrer_host}</span>}</td>
      <td className="mono px-4 py-3 text-right text-slate-300">{visitor.session_count}</td>
      <td className="mono px-4 py-3 text-right"><span className="text-emerald-300">{visitor.login_success_count}</span> <span className="text-slate-600">/</span> <span className={visitor.login_failure_count > 0 ? 'text-amber-300' : 'text-slate-600'}>{visitor.login_failure_count}</span></td>
      <td className="px-4 py-3 text-slate-500 sm:px-5" title={new Date(visitor.first_seen_at).toLocaleString()}>{formatRelativeTime(visitor.first_seen_at)}</td>
      <td className="px-4 py-3 text-slate-300 sm:px-5" title={new Date(visitor.last_seen_at).toLocaleString()}>{formatRelativeTime(visitor.last_seen_at)}</td>
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
      setError('The timeline could not be loaded. Only active administrators can read monitoring data.')
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
        title={`Visitor ${visitorShortLabel(visitor.visitor_key)} — activity timeline`}
        description={`First seen ${new Date(visitor.first_seen_at).toLocaleString()} · last active ${formatRelativeTime(visitor.last_seen_at)}`}
        action={<div className="flex gap-2"><button type="button" className="btn-ghost text-xs" onClick={() => { void load() }}><RefreshCw className="h-3.5 w-3.5" /> Reload</button><button type="button" className="btn-ghost text-xs" onClick={onClose} aria-label="Close timeline">Close</button></div>}
      />
      {error && <InlineError message={error} onRetry={() => { void load() }} />}
      {loading && timeline === null ? <LoadingRows count={4} /> : timeline === null || timeline.length === 0 ? (
        <EmptyState icon={Eye} title="No recorded events" description="Meaningful milestones (entry, page opens, login attempts) appear here as they happen." />
      ) : (
        <ol className="space-y-1 border-t border-white/[.06] px-2 py-3 sm:px-4">
          {timeline.map((event) => (
            <li key={event.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[.025]">
              <span className="mono w-14 shrink-0 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.result === 'success' ? 'bg-emerald-300' : event.result === 'failure' ? 'bg-rose-300' : 'bg-slate-500'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{securityEventLabel(event)}{event.reason ? <span className="ml-2 text-[10px] text-slate-600">({event.reason.replace(/_/g, ' ')})</span> : null}</span>
              {event.severity !== 'normal' && <StatusBadge label={SEVERITY_LABELS[event.severity]} tone={severityTone(event.severity)} />}
              {event.recent_failure_count > 1 && <span className="mono text-[10px] text-slate-600">{event.recent_failure_count} recent failures</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

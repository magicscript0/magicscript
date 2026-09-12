import { useCallback, useMemo, useState } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react'
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
  listSecurityEvents,
  reasonLabel,
  securityEventLabel,
  severityTone,
  visitorShortLabel,
  type MonitoringRange,
} from '../services/securityMonitoring'
import type { SecurityEventRow, SecurityEventResult, SecurityEventType, SecuritySeverity, VisitorDeviceType } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

interface AuthFeed {
  events: SecurityEventRow[]
  summary: Awaited<ReturnType<typeof getMonitoringSummary>>
}

/** Only authentication-relevant events are shown on this page. */
const AUTH_EVENT_TYPES: readonly SecurityEventType[] = [
  'game_login_success',
  'game_login_failure',
  'game_access_expired',
  'game_access_revoked',
  'game_logout',
  'admin_login_success',
  'admin_login_failure',
  'admin_logout',
]

const EVENT_TYPE_OPTIONS: ReadonlyArray<{ value: SecurityEventType; label: string }> = [
  { value: 'game_login_success', label: 'Game login — success' },
  { value: 'game_login_failure', label: 'Game login — failed' },
  { value: 'game_access_expired', label: 'Expired game access attempt' },
  { value: 'game_access_revoked', label: 'Revoked game access attempt' },
  { value: 'game_logout', label: 'Game logout' },
  { value: 'admin_login_success', label: 'Admin login — success' },
  { value: 'admin_login_failure', label: 'Admin login — failed' },
  { value: 'admin_logout', label: 'Admin logout' },
]

function resultTone(result: SecurityEventResult): 'success' | 'danger' | 'neutral' {
  if (result === 'success') return 'success'
  if (result === 'failure') return 'danger'
  return 'neutral'
}

/**
 * AUTHENTICATION ACTIVITY — every login and access attempt across BOTH
 * existing authentication systems (Supabase Auth for administrators, Game
 * Access codes for end users). Each row shows the outcome, a failure
 * CATEGORY, and how many failures preceded it — never any submitted secret.
 */
export function AuthActivityPage() {
  const [range, setRange] = useState<MonitoringRange>('24h')
  const [result, setResult] = useState<SecurityEventResult | 'all'>('all')
  const [eventType, setEventType] = useState<SecurityEventType | 'all'>('all')
  const [country, setCountry] = useState<string>('all')
  const [device, setDevice] = useState<VisitorDeviceType | 'all'>('all')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [search, setSearch] = useState('')

  const refreshKey = JSON.stringify({ range, result, eventType, country, device, flaggedOnly, search })
  const loader = useCallback(async (): Promise<AuthFeed> => {
    const [rows, summary] = await Promise.all([
      listSecurityEvents({
        range,
        result,
        eventType,
        severity: flaggedOnly ? 'flagged' : 'all',
        country,
        device,
        search,
        limit: 200,
      }),
      getMonitoringSummary(),
    ])
    // This section is scoped to authentication events; session/page events
    // live in the Visitor Activity timeline instead.
    return { events: rows.filter((row) => AUTH_EVENT_TYPES.includes(row.event_type)), summary }
  }, [range, result, eventType, country, device, flaggedOnly, search])

  const feed = useMonitoringFeed<AuthFeed>(loader, refreshKey)
  const events = useMemo(() => feed.data?.events ?? [], [feed.data])
  const summary = feed.data?.summary

  const countries = useMemo(
    () => [...new Set(events.map((event) => event.country_code).filter((value): value is string => value !== null))].sort(),
    [events],
  )
  const devices = useMemo(
    () => [...new Set(events.map((event) => event.device_type).filter((value): value is VisitorDeviceType => value !== null && value !== 'unknown'))].sort(),
    [events],
  )

  return <>
    <PageHeader
      eyebrow="Monitoring / authentication"
      title="Authentication activity"
      description="Successful and failed authentication events from the existing Supabase Auth (admin) and Game Access (end-user) systems. Failures are stored as categories — entered passwords or access codes are never recorded anywhere."
      action={<button type="button" className="btn-ghost" onClick={() => { void feed.reload() }}><RefreshCw className="h-4 w-4" /> Refresh</button>}
    />

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Successful logins" value={summary ? String(summary.successfulLogins) : '—'} detail="Last 24 hours (both systems)" icon={ShieldCheck} tone="green" loading={feed.loading && !summary} />
      <MetricCard label="Failed login attempts" value={summary ? String(summary.failedLogins) : '—'} detail="Last 24 hours (both systems)" icon={KeyRound} tone="amber" loading={feed.loading && !summary} />
      <MetricCard label="Suspicious activity" value={summary ? String(summary.flaggedEvents) : '—'} detail="Warning level or above (24h)" icon={ShieldQuestion} tone="cyan" loading={feed.loading && !summary} />
      <MetricCard label="Events in view" value={String(events.length)} detail={`${MONITORING_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? ''} · newest first`} icon={KeyRound} tone="slate" loading={feed.loading && events.length === 0} />
    </div>

    {feed.error && <div className="mb-5"><InlineError message={feed.error} onRetry={() => { void feed.reload() }} /></div>}

    <section className="panel p-0">
      <div className="flex flex-col gap-3 border-b border-white/[.06] p-4 sm:p-5">
        <PanelHeading
          icon={KeyRound}
          title="Authentication events"
          description="Event, pseudonymous visitor, account when known, outcome, failure category, and recent-failure context."
          action={<StatusBadge label={feed.live ? 'Live' : 'Auto-refresh 45s'} tone={feed.live ? 'success' : 'info'} pulse={feed.live} />}
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Period</span>
            <select className="select h-10 text-xs" value={range} onChange={(event) => setRange(event.target.value as MonitoringRange)} aria-label="Filter by period">
              {MONITORING_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Result</span>
            <select className="select h-10 text-xs" value={result} onChange={(event) => setResult(event.target.value as SecurityEventResult | 'all')} aria-label="Filter by result">
              <option value="all">Successful & failed</option>
              <option value="success">Successful</option>
              <option value="failure">Failed</option>
              <option value="info">Informational</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Event type</span>
            <select className="select h-10 text-xs" value={eventType} onChange={(event) => setEventType(event.target.value as SecurityEventType | 'all')} aria-label="Filter by event type">
              <option value="all">All event types</option>
              {EVENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Country</span>
            <select className="select h-10 text-xs" value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Filter by country">
              <option value="all">All countries</option>
              {countries.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Device</span>
            <select className="select h-10 text-xs" value={device} onChange={(event) => setDevice(event.target.value as VisitorDeviceType | 'all')} aria-label="Filter by device type">
              <option value="all">All devices</option>
              {devices.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="field-label mb-0">Search</span>
            <input className="input mono h-10 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Visitor key or Account ID" aria-label="Search events" />
          </label>
          <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-xs text-slate-400">
            <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
            Suspicious activity only
          </label>
        </div>
      </div>

      {feed.loading && events.length === 0 ? <div className="p-4 sm:p-5"><LoadingRows count={7} /></div> : events.length === 0 ? (
        <EmptyState icon={KeyRound} title="No authentication events in this window" description="Admin sign-ins and game access redemptions appear here with their outcome and failure category." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/[.06] text-[10px] uppercase tracking-[.12em] text-slate-500">
                <th className="px-4 py-3 sm:px-5">Time</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Visitor</th>
                <th className="px-4 py-3">Account / user</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Recent fails</th>
                <th className="px-4 py-3 sm:px-5">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[.05]">
              {events.map((event) => <AuthEventRow key={event.id} event={event} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-xs leading-5 text-emerald-100">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <p>Neither authentication system was modified: events are recorded around the existing Supabase Auth and Game Access RPC flows. A failed event stores only the failure category (for example “invalid code”) and the recent-failure count — the submitted password or access code is never sent, stored, or shown. {events.some((event) => event.path) ? `Page context: ${[...new Set(events.map((event) => event.path).filter(Boolean).map((path) => TRACKED_PATH_LABELS[path as string] ?? path))].join(', ')}.` : ''}</p>
    </div>
  </>
}

function AuthEventRow({ event }: { event: SecurityEventRow }) {
  const deviceText = [event.device_type && event.device_type !== 'unknown' ? event.device_type : null, event.browser, event.os]
    .filter((value): value is string => value !== null)
    .join(' · ') || '—'
  return (
    <tr className="transition hover:bg-white/[.03]">
      <td className="whitespace-nowrap px-4 py-3 text-slate-500 sm:px-5" title={new Date(event.created_at).toLocaleString()}>
        <span className="mono">{new Date(event.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <span className="ml-2 text-[10px]">{formatRelativeTime(event.created_at)}</span>
      </td>
      <td className="px-4 py-3 font-semibold text-slate-200">{securityEventLabel(event)}</td>
      <td className="mono px-4 py-3 text-emerald-200">{visitorShortLabel(event.visitor_key)}</td>
      <td className="mono px-4 py-3 text-slate-400">
        {event.game_account_id ?? (event.user_id ? <span title={event.user_id}>user {event.user_id.slice(0, 8)}…</span> : '—')}
      </td>
      <td className="mono px-4 py-3 text-slate-300">{event.country_code ?? '—'}</td>
      <td className="px-4 py-3 text-slate-400"><span className="capitalize">{deviceText}</span></td>
      <td className="px-4 py-3"><StatusBadge label={event.result === 'success' ? 'Success' : event.result === 'failure' ? 'Failed' : 'Info'} tone={resultTone(event.result)} /></td>
      <td className="px-4 py-3 text-slate-400">{reasonLabel(event.reason) ?? '—'}</td>
      <td className={`mono px-4 py-3 text-right ${event.recent_failure_count >= 4 ? 'font-semibold text-rose-300' : event.recent_failure_count >= 2 ? 'text-amber-300' : 'text-slate-500'}`}>{event.recent_failure_count}</td>
      <td className="px-4 py-3 sm:px-5"><StatusBadge label={SEVERITY_LABELS[event.severity as SecuritySeverity]} tone={severityTone(event.severity)} pulse={event.severity === 'high_risk'} /></td>
    </tr>
  )
}

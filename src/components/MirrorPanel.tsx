import { RefreshCw, Rocket, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import type { FirebaseConnectionState } from '../types/game'
import type { M11MirrorState, M11MirrorStatus } from '../hooks/useM11Mirror'

export interface MirrorPanelProps {
  connection: FirebaseConnectionState
  mirror: M11MirrorState
}

const CONNECTION_LABELS: Record<FirebaseConnectionState, string> = {
  unconfigured: 'Not configured (offline demo mode)',
  connecting: 'Connecting…',
  connected: 'Connected (read-only)',
  disconnected: 'Disconnected',
  error: 'Connection error',
}

const SYNC_LABELS: Record<M11MirrorStatus, string> = {
  idle: 'Not attached (offline demo mode)',
  syncing: 'Syncing…',
  empty: 'Empty',
  incomplete: 'Incomplete',
  invalid: 'Invalid data',
  valid: 'In sync',
  error: 'Sync error',
}

function formatKeyList(keys: readonly string[], max = 8): string {
  const shown = keys.slice(0, max).join(', ')
  return keys.length > max ? `${shown} +${keys.length - max} more` : shown
}

const WARNING_CLASSES =
  'mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200'
const OK_CLASSES =
  'mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs leading-relaxed text-emerald-200'
const READ_ONLY_NOTE = ' Nothing is created, repaired, or overwritten (read-only phase).'

/** Status card: Firebase connection + read-only /m11 synchronization state. */
export function MirrorPanel({ connection, mirror }: MirrorPanelProps) {
  const evaluation = mirror.evaluation
  const live = connection === 'connected'

  return (
    <aside
      aria-label="Database status"
      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm"
    >
      <div className="flex items-center gap-2 font-semibold text-slate-200">
        {mirror.active ? (
          <Wifi aria-hidden="true" className="h-4 w-4 text-emerald-400" />
        ) : (
          <WifiOff aria-hidden="true" className="h-4 w-4 text-slate-500" />
        )}
        Firebase · Realtime Database
      </div>

      <dl className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-400">
        <div className="flex justify-between gap-4">
          <dt>Status</dt>
          <dd className="text-right font-medium text-slate-300">
            {CONNECTION_LABELS[connection]}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Live /m11 sync</dt>
          <dd className="text-right font-medium text-slate-300" data-testid="m11-sync-status">
            {SYNC_LABELS[mirror.status]}
            {evaluation && mirror.status === 'incomplete'
              ? ` — ${evaluation.present.length}/50 keys`
              : ''}
            {evaluation && mirror.status === 'valid' ? ' — 50/50 keys valid' : ''}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Last update</dt>
          <dd className="text-right font-medium tabular-nums text-slate-300">
            {mirror.lastUpdated === null
              ? '—'
              : new Date(mirror.lastUpdated).toLocaleTimeString()}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Publishing</dt>
          <dd className="inline-flex items-center gap-1.5 text-right font-medium text-sky-300">
            <Rocket aria-hidden="true" className="h-3.5 w-3.5" />
            NEW GAME only (guarded)
          </dd>
        </div>
      </dl>

      {/* Sync observer messages — all strictly non-destructive */}
      {mirror.active && mirror.status === 'syncing' && (
        <p role="status" className={OK_CLASSES}>
          <RefreshCw aria-hidden="true" className="mr-1 inline h-3 w-3 animate-spin" />
          Observing /m11 (m1–m50), waiting for the first snapshot…
        </p>
      )}

      {mirror.active && mirror.status === 'empty' && !live && (
        <p role="status" className={WARNING_CLASSES}>
          No /m11 data received yet — waiting for a database connection. Nothing is written
          or initialized in the meantime.
        </p>
      )}

      {mirror.active && mirror.status === 'empty' && live && (
        <p role="alert" className={WARNING_CLASSES}>
          <strong>/m11 is currently empty on the demo database.</strong>
          {READ_ONLY_NOTE} The local demo generator below remains fully functional.
        </p>
      )}

      {mirror.active && mirror.status === 'incomplete' && evaluation && (
        <p role="alert" className={WARNING_CLASSES}>
          <strong>
            /m11 is incomplete — {evaluation.present.length} of 50 keys present.
          </strong>{' '}
          Missing: {formatKeyList(evaluation.missing)}.
          {READ_ONLY_NOTE} Note: a missing child makes the Android demo client crash when
          its cell is tapped, so treat an incomplete node as broken data.
        </p>
      )}

      {mirror.active && mirror.status === 'invalid' && evaluation && (
        <p role="alert" className={WARNING_CLASSES}>
          <strong>/m11 contains malformed data.</strong> Invalid at:{' '}
          {formatKeyList(evaluation.invalid)}
          {evaluation.missing.length > 0 &&
            ` · missing: ${formatKeyList(evaluation.missing)}`}
          . Every child must be exactly {'{'} mN: "0" | "1" {'}'} with string values.
          {READ_ONLY_NOTE}
        </p>
      )}

      {mirror.active && mirror.status === 'valid' && evaluation && (
        <p role="status" className={OK_CLASSES}>
          <ShieldCheck aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
          /m11 fully synchronized — 50/50 keys valid · {evaluation.safeCount} safe ·{' '}
          {50 - evaluation.safeCount} bomb cells. Observation only.
        </p>
      )}

      {mirror.active && mirror.status === 'error' && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {mirror.error ?? 'Live /m11 observation failed.'} The local demo generator below
          remains fully functional.
        </p>
      )}

      {!mirror.active && (
        <p className="mt-3 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-500">
          Running fully offline — no Firebase calls are made. The local demo generator
          remains fully functional without Firebase. For the read-only live mirror, copy{' '}
          <code className="text-slate-400">.env.example</code> to{' '}
          <code className="text-slate-400">.env</code> — only the database URL is required
          (no API key needed for this read-only mirror).
        </p>
      )}
    </aside>
  )
}

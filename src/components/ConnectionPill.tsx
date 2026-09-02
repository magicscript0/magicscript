import { AlertTriangle, Plug, PlugZap } from 'lucide-react'
import type { FirebaseConnectionState } from '../types/game'

const LABELS: Record<FirebaseConnectionState, string> = {
  unconfigured: 'Not configured · offline demo',
  connecting: 'DB connecting…',
  connected: 'DB connected · read-only',
  disconnected: 'DB disconnected',
  error: 'DB error',
}

const DOT_CLASSES: Record<FirebaseConnectionState, string> = {
  unconfigured: 'bg-slate-500',
  connecting: 'bg-amber-400 animate-pulse-soft',
  connected: 'bg-emerald-400',
  disconnected: 'bg-amber-400',
  error: 'bg-rose-400',
}

export function ConnectionPill({ state }: { state: FirebaseConnectionState }) {
  const Icon = state === 'unconfigured' ? Plug : PlugZap
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300"
      title={state === 'unconfigured' ? 'Firebase is not configured — see README' : undefined}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT_CLASSES[state]}`} />
      <span className="hidden sm:inline">{LABELS[state]}</span>
      {state === 'error' && <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-rose-400" />}
    </span>
  )
}

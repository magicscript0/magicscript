import { AlertTriangle, Plug, PlugZap } from 'lucide-react'
import type { FirebaseConnectionState } from '../types/game'

const LABELS: Record<FirebaseConnectionState, string> = {
  unconfigured: 'Not configured',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
}
const DOTS: Record<FirebaseConnectionState, string> = {
  unconfigured: 'bg-slate-500',
  connecting: 'bg-amber-300 animate-pulse-soft',
  connected: 'bg-emerald-300',
  disconnected: 'bg-amber-300',
  error: 'bg-rose-300',
}

export function ConnectionPill({ state }: { state: FirebaseConnectionState }) {
  const Icon = state === 'unconfigured' ? Plug : PlugZap
  return <span className="status-badge border-white/[.1] bg-white/[.035] text-slate-400" title="Existing Firebase realtime bridge status"><Icon className="h-3.5 w-3.5" /><span className={`status-dot ${DOTS[state]}`} /><span className="hidden sm:inline">Firebase · {LABELS[state]}</span>{state === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />}</span>
}

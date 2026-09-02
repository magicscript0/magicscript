import { ArrowUpRight, Check, ChevronRight, CircleHelp, Loader2, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-slate-100 sm:text-[30px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'green',
  loading = false,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone?: 'green' | 'cyan' | 'amber' | 'slate'
  loading?: boolean
}) {
  const toneClasses = {
    green: 'border-emerald-300/15 bg-emerald-300/[.055] text-emerald-300',
    cyan: 'border-cyan-300/15 bg-cyan-300/[.055] text-cyan-300',
    amber: 'border-amber-300/15 bg-amber-300/[.055] text-amber-200',
    slate: 'border-white/[.1] bg-white/[.035] text-slate-300',
  }
  return (
    <article className="panel min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${toneClasses[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      {loading ? <div className="skeleton mt-4 h-8 w-24" /> : <p className="mono mt-4 truncate text-2xl font-semibold tracking-[-.035em] text-slate-100">{value}</p>}
      <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
    </article>
  )
}

export function StatusBadge({
  label,
  tone = 'neutral',
  pulse = false,
}: {
  label: string
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  pulse?: boolean
}) {
  const colors = {
    success: 'border-emerald-300/20 bg-emerald-300/[.08] text-emerald-200',
    warning: 'border-amber-300/20 bg-amber-300/[.08] text-amber-200',
    danger: 'border-rose-300/20 bg-rose-300/[.08] text-rose-200',
    info: 'border-cyan-300/20 bg-cyan-300/[.08] text-cyan-200',
    neutral: 'border-white/[.12] bg-white/[.04] text-slate-300',
  }
  return <span className={`status-badge ${colors[tone]}`}><span className={`status-dot ${pulse ? 'animate-pulse-soft' : ''} ${tone === 'success' ? 'bg-emerald-300' : tone === 'warning' ? 'bg-amber-300' : tone === 'danger' ? 'bg-rose-300' : tone === 'info' ? 'bg-cyan-300' : 'bg-slate-400'}`} />{label}</span>
}

export function PanelHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/15 bg-emerald-300/[.06] text-emerald-300"><Icon className="h-4 w-4" /></span>}
        <div className="min-w-0"><h2 className="text-sm font-semibold text-slate-100">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[.09] bg-white/[.035] text-slate-500"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-semibold text-slate-200">{title}</h3><p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-2">{Array.from({ length: count }, (_, index) => <div key={index} className="skeleton h-12 w-full" />)}</div>
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-4 py-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{message}</span>{onRetry && <button type="button" className="btn-ghost self-start text-xs sm:self-auto" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</button>}</div>
}

export function SaveButton({ saving, children = 'Save changes' }: { saving: boolean; children?: ReactNode }) {
  return <button type="submit" className="btn-primary" disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" />{children}</>}</button>
}

export function Breadcrumb({ label }: { label: string }) {
  return <div className="mb-5 flex items-center gap-1.5 text-xs text-slate-600"><span>Workspace</span><ChevronRight className="h-3 w-3" /><span className="text-slate-400">{label}</span></div>
}

export function HelpHint({ children }: { children: ReactNode }) {
  return <span className="group relative inline-flex"><CircleHelp className="h-3.5 w-3.5 text-slate-600" /><span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-lg border border-white/[.1] bg-[#11191a] px-3 py-2 text-[11px] leading-4 text-slate-300 opacity-0 shadow-xl transition group-hover:opacity-100">{children}</span></span>
}

export function ExternalLinkMark() {
  return <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
}

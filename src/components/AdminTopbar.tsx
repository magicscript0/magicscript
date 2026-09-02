import { useEffect, useState } from 'react'
import { Bell, ChevronDown, Menu, X } from 'lucide-react'
import type { AdminProfile } from '../types/supabase'
import { roleLabel } from '../utils/permissions'
import type { PageRoute } from '../hooks/usePageRoute'
import { BrandMark } from './BrandMark'

const TITLES: Record<PageRoute, { title: string; subtitle: string }> = {
  dashboard: { title: 'System overview', subtitle: 'A clear view of your control plane and live bridge.' },
  game: { title: 'Game console', subtitle: 'Generate, validate, publish, and reveal a round.' },
  history: { title: 'Round history', subtitle: 'Operational records for recent round activity.' },
  codes: { title: 'Admin codes', subtitle: 'Issue and control time-bound administrator access.' },
  logs: { title: 'Activity logs', subtitle: 'A transparent trail of workspace actions.' },
  social: { title: 'Social links', subtitle: 'Manage the public links shown across the site.' },
  display: { title: 'Display settings', subtitle: 'Tune the public-facing presence and visual counters.' },
  general: { title: 'General settings', subtitle: 'Keep the workspace identity and notices up to date.' },
  profile: { title: 'Your profile', subtitle: 'Account details and current workspace access.' },
}

export function AdminTopbar({
  admin,
  route,
  announcement,
  onOpenMenu,
}: {
  admin: AdminProfile
  route: PageRoute
  announcement: string
  onOpenMenu: () => void
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const copy = TITLES[route]
  const initials = (admin.username || admin.email).slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!notificationsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [notificationsOpen])
  return (
    <header className="sticky top-0 z-20 border-b border-white/[.07] bg-[#070a0d]/80 backdrop-blur-xl">
      <div className="flex min-h-[76px] items-center gap-3 px-4 sm:px-7 lg:px-9">
        <button type="button" onClick={onOpenMenu} className="rounded-xl border border-white/[.1] p-2.5 text-slate-400 hover:text-slate-100 lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 lg:hidden"><BrandMark compact /><span className="text-xs font-bold tracking-[.16em] text-slate-100">MAGIC SCRIPT</span></div>
        <div className="hidden min-w-0 lg:block">
          <p className="text-lg font-semibold tracking-[-.02em] text-slate-100">{copy.title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{copy.subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-3 py-1.5 text-[11px] font-semibold text-emerald-200 sm:inline-flex">
            <span className="status-dot animate-pulse-soft bg-emerald-300" /> Control plane online
          </span>
          <div className="relative">
            <button
              type="button"
              className="relative rounded-xl border border-white/[.08] p-2.5 text-slate-500 transition hover:border-white/[.16] hover:text-slate-200"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-controls="notification-panel"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell className="h-[17px] w-[17px]" />
              {announcement && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(99,216,232,.8)]" />}
            </button>
            {notificationsOpen && (
              <div id="notification-panel" role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-30 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-white/[.1] bg-[#101719]/[.98] p-4 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-100">Notifications</p><button type="button" onClick={() => setNotificationsOpen(false)} className="rounded-lg p-1 text-slate-500 hover:text-slate-200" aria-label="Close notifications"><X className="h-4 w-4" /></button></div>
                {announcement ? <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-300">Workspace announcement</p><p className="mt-2 text-xs leading-5 text-slate-300">{announcement}</p></div> : <p className="mt-4 text-xs leading-5 text-slate-500">No new workspace announcements.</p>}
                <p className="mt-4 border-t border-white/[.07] pt-3 text-[11px] leading-5 text-slate-600">Action confirmations and errors appear as temporary notifications.</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.025] py-1.5 pl-1.5 pr-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-300/80 to-emerald-300/80 text-[10px] font-extrabold text-[#052119]">{initials}</span>
            <div className="hidden leading-tight sm:block"><p className="max-w-[130px] truncate text-xs font-semibold text-slate-200">{admin.username || admin.email}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{roleLabel(admin.role)}</p></div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-600 sm:block" />
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 lg:hidden"><p className="text-base font-semibold text-slate-100">{copy.title}</p><p className="mt-0.5 text-xs text-slate-500">{copy.subtitle}</p></div>
    </header>
  )
}

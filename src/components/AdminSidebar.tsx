import { useEffect } from 'react'
import {
  Activity,
  Cable,
  ClipboardList,
  Command,
  FileKey2,
  Gauge,
  LayoutDashboard,
  LogOut,
  Settings2,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AdminRole } from '../types/supabase'
import type { PageRoute } from '../hooks/usePageRoute'
import { can, roleLabel, type Permission } from '../utils/permissions'
import { BrandMark } from './BrandMark'

interface NavigationItem {
  route: PageRoute
  label: string
  icon: LucideIcon
  permission: Permission
}

const NAVIGATION: readonly NavigationItem[] = [
  { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { route: 'game', label: 'Game Console', icon: Gauge, permission: 'game.use' },
  { route: 'history', label: 'Round History', icon: ClipboardList, permission: 'history.view' },
  { route: 'codes', label: 'Admin Codes', icon: FileKey2, permission: 'codes.manage' },
  { route: 'logs', label: 'Activity Logs', icon: Activity, permission: 'logs.view' },
]

const SETTINGS: readonly NavigationItem[] = [
  { route: 'social', label: 'Social Links', icon: Cable, permission: 'social.manage' },
  { route: 'display', label: 'Display Settings', icon: SlidersHorizontal, permission: 'display.manage' },
  { route: 'general', label: 'General Settings', icon: Settings2, permission: 'general.manage' },
  { route: 'profile', label: 'Profile', icon: UserRound, permission: 'profile.view' },
]

export interface AdminSidebarProps {
  role: AdminRole
  route: PageRoute
  open: boolean
  username: string
  onNavigate: (route: PageRoute) => void
  onLogout: () => void
  onClose: () => void
}

export function AdminSidebar({ role, route, open, username, onNavigate, onLogout, onClose }: AdminSidebarProps) {
  const visibleMain = NAVIGATION.filter((item) => can(role, item.permission))
  const visibleSettings = SETTINGS.filter((item) => can(role, item.permission))

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const links = (items: readonly NavigationItem[]) => items.map(({ route: itemRoute, label, icon: Icon }) => (
    <button
      type="button"
      key={itemRoute}
      onClick={() => { onNavigate(itemRoute); onClose() }}
      className={`group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${route === itemRoute ? 'bg-emerald-300/12 text-emerald-200 shadow-[inset_2px_0_0_#46e3a1]' : 'text-slate-400 hover:bg-white/[.045] hover:text-slate-100'}`}
      aria-current={route === itemRoute ? 'page' : undefined}
    >
      <Icon className={`h-[17px] w-[17px] shrink-0 ${route === itemRoute ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
      {label}
    </button>
  ))

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-white/[.08] bg-[#0a1011]/95 px-3 py-4 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2 pb-7">
          <div className="flex items-center gap-3">
            <BrandMark compact />
            <div className="leading-none">
              <p className="text-sm font-bold tracking-[.14em] text-slate-100">MAGIC SCRIPT</p>
              <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[.18em] text-emerald-400/75">Control center</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:text-slate-200 lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto">
          <p className="eyebrow px-3 pb-2">Workspace</p>
          <div className="space-y-1">{links(visibleMain)}</div>
          {visibleSettings.length > 0 && (
            <>
              <p className="eyebrow mt-7 px-3 pb-2">Configuration</p>
              <div className="space-y-1">{links(visibleSettings)}</div>
            </>
          )}
        </nav>

        <div className="mt-5 border-t border-white/[.07] pt-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[.03] px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><Command className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-200">{username || 'Workspace admin'}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{roleLabel(role)}</p>
            </div>
          </div>
          <button type="button" onClick={onLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-200">
            <LogOut className="h-[17px] w-[17px]" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

export { NAVIGATION, SETTINGS }

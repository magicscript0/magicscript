import { LogOut, User, Users } from 'lucide-react'
import type { FirebaseConnectionState } from '../types/game'
import { ConnectionPill } from './ConnectionPill'

export interface HeaderProps {
  operatorId: string
  onlineUsers: number
  connection: FirebaseConnectionState
  onLogout: () => void
}

/** Sticky console header: brand, operator ID, simulated online users, DB status. */
export function Header({ operatorId, onlineUsers, connection, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-glow-safe">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-5 w-5">
              <path
                d="M32 16c-2-4-7-5-9-4 0 3 3 6 7 6-6 1-11 6-11 14 0 10 6 18 12 18 3 0 4-1 6-1s3 1 6 1c6 0 12-8 12-18 0-10-8-15-13-14-3 .6-7-3-10-2z"
                fill="#062f24"
              />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-wide text-slate-100">APPLE CONSOLE</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">
              Operator · Demo
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Logged-in operator */}
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
            <User aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="text-slate-400">ID:</span>
            <span data-testid="operator-id" className="max-w-[160px] truncate font-semibold">
              {operatorId}
            </span>
          </span>

          {/* Simulated online users (UI decoration only) */}
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden text-slate-400 sm:inline">ONLINE USERS</span>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-soft" />
            <span className="font-semibold tabular-nums" data-testid="online-users">
              {onlineUsers}
            </span>
          </span>

          <ConnectionPill state={connection} />

          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out of the demo console"
            title="Log out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 text-slate-400 transition-colors hover:border-rose-400/40 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}

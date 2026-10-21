import { Activity, Coins, DollarSign, Layers, Trophy, Wallet } from 'lucide-react'
import type { LiveGameState, BalanceState } from '../types/labx'

export interface LiveStatsPanelProps {
  game: LiveGameState
  balanceState: BalanceState
}

export function LiveStatsPanel({ game, balanceState }: LiveStatsPanelProps) {
  const currentBalance = balanceState.balance
  const betSum = game.bet_sum
  const winSum = game.win_sum
  const startingBalance =
    currentBalance !== null && betSum !== null && game.active
      ? Number((currentBalance + betSum).toFixed(2))
      : currentBalance

  const netProfit =
    betSum !== null && winSum !== null && (game.active || winSum > 0)
      ? Number((winSum - betSum).toFixed(2))
      : null

  const getStatusBadge = () => {
    if (!game.active) {
      return {
        label: 'WAITING',
        arabic: 'في الانتظار',
        classes: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
      }
    }
    if (winSum !== null && winSum > 0) {
      return {
        label: 'ACTIVE (IN PROFIT)',
        arabic: 'نشط (متقدم)',
        classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse',
      }
    }
    return {
      label: 'ACTIVE',
      arabic: 'نشط',
      classes: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse',
    }
  }

  const status = getStatusBadge()

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[.08] bg-slate-950/80 p-4.5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[.06] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Live Telemetry / إحصائيات الجلسة
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {game.session_id && (
            <span className="rounded-md bg-white/[.05] px-2 py-0.5 font-mono text-[11px] text-slate-400">
              #{game.session_id}
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${status.classes}`}
          >
            {status.arabic} ({status.label})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {/* Starting Balance */}
        <div className="rounded-xl border border-white/[.04] bg-white/[.02] p-3 transition-colors hover:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span>دخلت بـ (Initial):</span>
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-100">
            {startingBalance !== null ? `${startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP` : '--'}
          </div>
        </div>

        {/* Current Balance */}
        <div className="rounded-xl border border-white/[.04] bg-white/[.02] p-3 transition-colors hover:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Wallet className="h-3.5 w-3.5 text-emerald-400" />
            <span>الرصيد الحالي:</span>
          </div>
          <div className="mt-1 font-mono text-base font-bold text-emerald-400">
            {currentBalance !== null ? `${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP` : '--'}
          </div>
        </div>

        {/* Bet Sum */}
        <div className="rounded-xl border border-white/[.04] bg-white/[.02] p-3 transition-colors hover:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <DollarSign className="h-3.5 w-3.5 text-cyan-400" />
            <span>الرهان (Bet):</span>
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-200">
            {betSum !== null ? `${betSum.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP` : '--'}
          </div>
        </div>

        {/* Profit / Won */}
        <div className="rounded-xl border border-white/[.04] bg-white/[.02] p-3 transition-colors hover:bg-white/[.04]">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Trophy className="h-3.5 w-3.5 text-yellow-400" />
            <span>المكسب (Profit):</span>
          </div>
          <div
            className={`mt-1 font-mono text-base font-bold ${
              netProfit === null
                ? 'text-slate-400'
                : netProfit > 0
                  ? 'text-emerald-400'
                  : netProfit < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
            }`}
          >
            {netProfit !== null ? `${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP` : '--'}
          </div>
        </div>
      </div>

      {/* Row level indicator bar */}
      <div className="mt-1 rounded-xl border border-white/[.05] bg-black/40 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>الصف الحالي (Level):</span>
          </span>
          <span className="font-mono font-bold text-cyan-300">
            {game.active ? `Row ${game.current_row + 1} / 10` : 'Idle'}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${game.active ? ((game.current_row + (game.user_picks.length > game.current_row ? 1 : 0)) / 10) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}

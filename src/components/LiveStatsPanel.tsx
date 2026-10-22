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
        text: 'WAITING / في الانتظار',
        classes: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
        dotColor: 'bg-slate-500',
      }
    }
    if (winSum !== null && winSum > 0) {
      return {
        text: 'IN PROFIT / نشط (متقدم)',
        classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
        dotColor: 'bg-emerald-400 animate-ping',
      }
    }
    return {
      text: 'ACTIVE / نشط',
      classes: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(0,242,254,0.2)]',
      dotColor: 'bg-cyan-400 animate-ping',
    }
  }

  const status = getStatusBadge()

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-white/[.08] bg-slate-950/85 p-3.5 sm:p-5 backdrop-blur-xl shadow-2xl">
      {/* Header with Title and Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[.06] pb-3.5">
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
            dir="ltr"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${status.classes}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
            <span>{status.text}</span>
          </span>
        </div>
      </div>

      {/* Grid of Key Financial Metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Initial Balance */}
        <div className="rounded-xl border border-white/[.06] bg-slate-900/40 p-3 sm:p-3.5 transition-colors hover:bg-slate-900/60">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Coins className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <span className="truncate">الرصيد الابتدائي / Initial</span>
          </div>
          <div dir="ltr" className="mt-1.5 font-mono text-sm sm:text-base font-bold text-slate-200">
            {startingBalance !== null
              ? `${startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP`
              : '--'}
          </div>
        </div>

        {/* Current Balance */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3 sm:p-3.5 transition-colors hover:border-emerald-500/35">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/80">
            <Wallet className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <span className="truncate">الرصيد الحالي / Current Balance</span>
          </div>
          <div dir="ltr" className="mt-1.5 font-mono text-sm sm:text-base font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
            {currentBalance !== null
              ? `${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP`
              : '--'}
          </div>
        </div>

        {/* Bet Sum */}
        <div className="rounded-xl border border-white/[.06] bg-slate-900/40 p-3 sm:p-3.5 transition-colors hover:bg-slate-900/60">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <DollarSign className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
            <span className="truncate">قيمة الرهان / Bet Amount</span>
          </div>
          <div dir="ltr" className="mt-1.5 font-mono text-sm sm:text-base font-bold text-slate-200">
            {betSum !== null ? `${betSum.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP` : '--'}
          </div>
        </div>

        {/* Profit / Net Won */}
        <div
          className={`rounded-xl border p-3 sm:p-3.5 transition-colors ${
            netProfit === null
              ? 'border-white/[.06] bg-slate-900/40'
              : netProfit > 0
                ? 'border-emerald-500/25 bg-emerald-950/20'
                : netProfit < 0
                  ? 'border-rose-500/25 bg-rose-950/20'
                  : 'border-white/[.06] bg-slate-900/40'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Trophy className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <span className="truncate">صافي الربح / Profit</span>
          </div>
          <div
            dir="ltr"
            className={`mt-1.5 font-mono text-sm sm:text-base font-bold ${
              netProfit === null
                ? 'text-slate-500'
                : netProfit > 0
                  ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]'
                  : netProfit < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
            }`}
          >
            {netProfit !== null
              ? `${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP`
              : '--'}
          </div>
        </div>
      </div>

      {/* Row level indicator bar */}
      <div className="rounded-xl border border-white/[.06] bg-slate-900/50 p-3 sm:p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Layers className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
            <span>المستوى الحالي / Level</span>
          </span>
          <span
            dir="ltr"
            className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-md ${
              game.active
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'bg-white/[.05] text-slate-400'
            }`}
          >
            {game.active ? `Row ${game.current_row + 1} / 10` : 'Idle'}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-400"
            style={{
              width: `${
                game.active
                  ? ((game.current_row + (game.user_picks.length > game.current_row ? 1 : 0)) / 10) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

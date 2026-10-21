import { Activity, Coins, DollarSign, Flame, Layers, Radio, TrendingUp, Trophy, Wallet } from 'lucide-react'
import { ROWS } from '../config/game'
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

  // Calculate ROI percentage if active
  const roiPercent =
    betSum !== null && betSum > 0 && netProfit !== null
      ? Number(((netProfit / betSum) * 100).toFixed(1))
      : null

  // Get current and next multiplier
  const currentRowIndex = game.current_row
  const currentMultiplier =
    game.active && currentRowIndex >= 0 && currentRowIndex < ROWS.length
      ? ROWS[currentRowIndex].multiplier
      : 1.0

  const nextMultiplier =
    game.active && currentRowIndex + 1 < ROWS.length
      ? ROWS[currentRowIndex + 1].multiplier
      : null

  const getStatusBadge = () => {
    if (!game.active) {
      return {
        label: 'STANDBY',
        arabic: 'في الانتظار',
        classes: 'border-slate-700/60 bg-slate-900/60 text-slate-400',
        dotClass: 'bg-slate-500',
      }
    }
    if (winSum !== null && winSum > (betSum ?? 0)) {
      return {
        label: 'ACTIVE • IN PROFIT',
        arabic: 'نشط • في أرباح',
        classes: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]',
        dotClass: 'bg-emerald-400 animate-ping',
      }
    }
    return {
      label: 'ACTIVE • IN PLAY',
      arabic: 'نشط • قيد اللعب',
      classes: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]',
      dotClass: 'bg-cyan-400 animate-ping',
    }
  }

  const status = getStatusBadge()

  // Altitude risk tier label
  const getAltitudeTier = (row: number) => {
    if (row < 3) return { text: 'BASE TIER', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40' }
    if (row < 6) return { text: 'MID ALTITUDE', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40' }
    if (row < 9) return { text: 'HIGH RISK', color: 'text-amber-400 border-amber-500/30 bg-amber-950/40' }
    return { text: 'APEX JACKPOT', color: 'text-yellow-300 border-yellow-500/50 bg-yellow-950/50 animate-pulse' }
  }

  const currentTier = getAltitudeTier(game.current_row)

  return (
    <div className="cockpit-panel relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 shadow-2xl">
      {/* Ambient background glow accent */}
      <div
        className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl transition-opacity duration-700 ${
          game.active && (netProfit ?? 0) > 0
            ? 'bg-emerald-500/15 opacity-100'
            : game.active
              ? 'bg-cyan-500/15 opacity-100'
              : 'bg-slate-500/5 opacity-50'
        }`}
      />

      {/* Top Header */}
      <div className="relative flex items-center justify-between border-b border-white/[.08] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-black tracking-widest uppercase text-slate-100">
              Flight Telemetry Cockpit
            </h3>
            <p className="text-[10px] font-medium text-slate-400">إحصائيات وبيانات الجلسة المباشرة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {game.session_id && (
            <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-300">
              #{game.session_id}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${status.classes}`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${status.dotClass}`} />
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
            </span>
            <span>{status.label}</span>
          </span>
        </div>
      </div>

      {/* Hero Balance Pod */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.06] via-black/40 to-black/60 p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <span>Current Available Balance / الرصيد الفعلي</span>
          </div>
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
            <Radio className="h-3 w-3 animate-pulse" /> Live Telemetry
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
            {currentBalance !== null
              ? currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '--.--'}
          </span>
          <span className="font-mono text-sm font-bold text-emerald-400/80">EGP</span>
        </div>

        {/* Small live delta banner */}
        <div className="mt-2.5 flex items-center justify-between border-t border-white/[.06] pt-2 text-xs">
          <span className="text-[11px] text-slate-400">
            Entered with (البداية):{' '}
            <span className="font-mono font-semibold text-slate-200">
              {startingBalance !== null ? `${startingBalance.toFixed(2)} EGP` : '--'}
            </span>
          </span>
          {netProfit !== null && (
            <span
              className={`flex items-center gap-1 font-mono text-[11px] font-bold ${
                netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <TrendingUp className={`h-3 w-3 ${netProfit < 0 ? 'rotate-180' : ''}`} />
              <span>
                {netProfit >= 0 ? '+' : ''}
                {netProfit.toFixed(2)} EGP
              </span>
              {roiPercent !== null && (
                <span className="rounded bg-white/5 px-1 text-[10px]">
                  ({roiPercent >= 0 ? '+' : ''}{roiPercent}%)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* 4 Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Metric 1: Initial Stake */}
        <div className="cockpit-card rounded-2xl p-3.5 transition-all hover:border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Initial Stake
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Coins className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-lg font-black text-slate-100">
            {startingBalance !== null ? `${startingBalance.toFixed(2)}` : '--'}
            <span className="ml-1 text-[11px] font-normal text-slate-400">EGP</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">رصيد بداية الجلسة</div>
        </div>

        {/* Metric 2: Active Bet */}
        <div className="cockpit-card rounded-2xl p-3.5 transition-all hover:border-cyan-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Current Bet
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 font-mono text-lg font-black text-slate-100">
            {betSum !== null ? `${betSum.toFixed(2)}` : '--'}
            <span className="ml-1 text-[11px] font-normal text-slate-400">EGP</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">قيمة الرهان النشط</div>
        </div>

        {/* Metric 3: Net Profit */}
        <div
          className={`cockpit-card rounded-2xl p-3.5 transition-all ${
            netProfit !== null && netProfit > 0
              ? 'border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : netProfit !== null && netProfit < 0
                ? 'border-rose-500/40 bg-rose-950/20'
                : 'hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Net Profit / المكسب
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
              <Trophy className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-2 font-mono text-lg font-black ${
              netProfit === null
                ? 'text-slate-400'
                : netProfit > 0
                  ? 'text-emerald-300'
                  : netProfit < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
            }`}
          >
            {netProfit !== null ? `${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}` : '--'}
            <span className="ml-1 text-[11px] font-normal text-slate-400">EGP</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">الأرباح الصافية الحالية</div>
        </div>

        {/* Metric 4: Multiplier Step */}
        <div className="cockpit-card rounded-2xl p-3.5 transition-all hover:border-purple-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Multiplier Step
            </span>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Flame className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono text-lg font-black text-cyan-300">
            <span>×{currentMultiplier.toFixed(2)}</span>
            {nextMultiplier !== null && (
              <span className="text-xs font-semibold text-slate-400">
                ➜ ×{nextMultiplier.toFixed(2)}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">مضاعف الجولة الحالية</div>
        </div>
      </div>

      {/* Altitude Level & 10-Segment LED Meter */}
      <div className="cockpit-card rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <Layers className="h-4 w-4 text-cyan-400" />
            <span>Flight Altitude Level / مستوى التقدم:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${currentTier.color}`}>
              {currentTier.text}
            </span>
            <span className="font-mono text-xs font-black text-cyan-300">
              {game.active ? `ROW ${game.current_row + 1} / 10` : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* 10 Segmented Altitude Blocks */}
        <div className="mt-3 grid grid-cols-10 gap-1.5">
          {ROWS.map((spec, idx) => {
            const isCompleted = game.active && idx < game.current_row
            const isCurrent = game.active && idx === game.current_row
            const isApex = idx === 9

            return (
              <div
                key={spec.row}
                title={`Row ${spec.row}: ×${spec.multiplier.toFixed(2)}`}
                className={`relative flex h-3.5 items-center justify-center rounded-sm transition-all duration-300 ${
                  isCurrent
                    ? 'border border-cyan-400 bg-cyan-400 shadow-[0_0_12px_#22d3ee] ring-2 ring-cyan-400/50'
                    : isCompleted
                      ? isApex
                        ? 'border border-amber-400 bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                        : 'border border-emerald-400/80 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                      : 'border border-white/[.06] bg-white/[.04]'
                }`}
              />
            )
          })}
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Row 1 (×1.23)</span>
          <span className="text-amber-400/80 font-bold">Apex Jackpot (×349.68)</span>
        </div>
      </div>
    </div>
  )
}

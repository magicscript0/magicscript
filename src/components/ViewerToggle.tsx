import { Eye, Gamepad2 } from 'lucide-react'

export interface ViewerToggleProps {
  mode: 'play' | 'viewer'
  onChange: (mode: 'play' | 'viewer') => void
}

export function ViewerToggle({ mode, onChange }: ViewerToggleProps) {
  return (
    <div className="relative flex items-center rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => onChange('play')}
        className={`group relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase transition-all duration-300 ${
          mode === 'play'
            ? 'border border-emerald-400/50 bg-gradient-to-r from-emerald-500/25 to-teal-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.35)]'
            : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[.04]'
        }`}
      >
        <Gamepad2 className={`h-3.5 w-3.5 transition-transform duration-200 ${mode === 'play' ? 'scale-110 text-emerald-300' : 'text-slate-400 group-hover:text-slate-200'}`} />
        <span>Play Mode</span>
        {mode === 'play' && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onChange('viewer')}
        className={`group relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase transition-all duration-300 ${
          mode === 'viewer'
            ? 'border border-cyan-400/50 bg-gradient-to-r from-cyan-500/25 to-blue-500/15 text-cyan-300 shadow-[0_0_16px_rgba(6,182,212,0.35)]'
            : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[.04]'
        }`}
      >
        <Eye className={`h-3.5 w-3.5 transition-transform duration-200 ${mode === 'viewer' ? 'scale-110 text-cyan-300' : 'text-slate-400 group-hover:text-slate-200'}`} />
        <span>Live Viewer</span>
        {mode === 'viewer' && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
        )}
      </button>
    </div>
  )
}

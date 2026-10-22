import { Eye, Gamepad2 } from 'lucide-react'

export interface ViewerToggleProps {
  mode: 'play' | 'viewer'
  onChange: (mode: 'play' | 'viewer') => void
}

export function ViewerToggle({ mode, onChange }: ViewerToggleProps) {
  return (
    <div className="flex items-center rounded-xl border border-white/[.08] bg-black/40 p-1 backdrop-blur-md">
      <button
        type="button"
        onClick={() => onChange('play')}
        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all ${
          mode === 'play'
            ? 'bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)] border border-emerald-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[.04] border border-transparent'
        }`}
      >
        <Gamepad2 className="h-3.5 w-3.5" />
        <span>Play Mode</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('viewer')}
        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all ${
          mode === 'viewer'
            ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)] border border-cyan-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[.04] border border-transparent'
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>Viewer Mode</span>
      </button>
    </div>
  )
}

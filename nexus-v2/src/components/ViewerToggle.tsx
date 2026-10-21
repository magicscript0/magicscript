import React from 'react'
import { Eye, Gamepad2 } from 'lucide-react'

export interface ViewerToggleProps {
  mode: 'play' | 'viewer'
  onChange: (mode: 'play' | 'viewer') => void
}

export function ViewerToggle({ mode, onChange }: ViewerToggleProps) {
  return (
    <div className="flex items-center rounded-xl border border-cyan-500/25 bg-slate-950/80 p-1 backdrop-blur-xl shadow-lg">
      <button
        type="button"
        onClick={() => onChange('play')}
        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-mono-tech font-bold tracking-wider transition-all ${
          mode === 'play'
            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400 shadow-[0_0_15px_rgba(0,242,254,0.35)]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
        }`}
      >
        <Gamepad2 className="h-4 w-4 text-cyan-400" />
        <span>PLAY MODE</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('viewer')}
        className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-mono-tech font-bold tracking-wider transition-all ${
          mode === 'viewer'
            ? 'bg-violet-500/25 text-violet-200 border border-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.35)]'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
        }`}
      >
        <Eye className="h-4 w-4 text-violet-400" />
        <span>VIEWER MODE</span>
      </button>
    </div>
  )
}

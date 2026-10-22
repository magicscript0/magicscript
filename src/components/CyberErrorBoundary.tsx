import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { ShieldAlert, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  moduleName?: string
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class CyberErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Error caught gracefully without leaking critical internals to client
    if (import.meta.env.DEV) {
      console.error('[CyberErrorBoundary] Caught module error:', error, errorInfo)
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      const moduleName = this.props.moduleName || 'CORE SUBSYSTEM'
      return (
        <div className="relative w-full p-6 sm:p-8 rounded-2xl bg-slate-950/90 border border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.2)] backdrop-blur-xl text-center overflow-hidden my-4">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center justify-center gap-4 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
              <ShieldAlert className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-mono-tech tracking-widest text-red-400/80 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                SYSTEM FAULT ISOLATED • {moduleName}
              </span>
              <h3 className="text-base sm:text-lg font-bold font-mono-tech text-white">
                SUB-ROUTINE EXECUTION INTERRUPTED
              </h3>
              <p className="text-xs text-slate-400 font-mono-tech leading-relaxed">
                A localized runtime condition occurred. The fault was contained to prevent session termination.
              </p>
            </div>

            <button
              type="button"
              onClick={this.handleReset}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 font-mono-tech font-bold text-xs uppercase tracking-wider transition-all duration-200 hover:shadow-[0_0_20px_rgba(239,68,68,0.35)] active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESTART SUBSYSTEM / إعادة المحاولة</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

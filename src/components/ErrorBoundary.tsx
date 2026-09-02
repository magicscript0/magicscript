import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Catches unexpected runtime errors and shows a friendly demo message. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Internal log only — never surfaced to the UI.
    console.error('[demo] Unexpected error:', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div
            role="alert"
            className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-slate-900/70 p-6 text-center"
          >
            <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-rose-400" />
            <h1 className="mt-3 text-lg font-bold text-slate-100">Something went wrong</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              The demo console hit an unexpected error and stopped. No data was changed
              anywhere — this app cannot write to the database.
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { error: Error | null }
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error('[MAGIC SCRIPT] unexpected error', error, info.componentStack) }
  private reset = () => { this.setState({ error: null }) }
  render() { if (!this.state.error) return this.props.children; return <main className="flex min-h-screen items-center justify-center p-5"><div role="alert" className="panel w-full max-w-md text-center"><AlertTriangle className="mx-auto h-8 w-8 text-rose-300" /><h1 className="mt-4 text-lg font-semibold text-slate-100">Workspace unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">Something interrupted this workspace. No control-plane changes were applied.</p><button type="button" onClick={this.reset} className="btn-ghost mt-5"><RotateCcw className="h-4 w-4" />Try again</button></div></main> }
}

import { Loader2 } from 'lucide-react'
import { BrandMark } from './BrandMark'

export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark />
        <div>
          <p className="text-sm font-semibold tracking-[.18em] text-slate-100">MAGIC SCRIPT</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            Securing workspace…
          </p>
        </div>
      </div>
    </main>
  )
}

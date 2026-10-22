import { CheckCircle2, X, XCircle } from 'lucide-react'

export interface ToastMessage {
  id: number
  tone: 'success' | 'error'
  message: string
}

export function ToastViewport({
  messages,
  onDismiss,
}: {
  messages: readonly ToastMessage[]
  onDismiss: (id: number) => void
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {messages.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm shadow-2xl backdrop-blur-xl ${
            toast.tone === 'error'
              ? 'border-rose-300/25 bg-[#231419]/95 text-rose-100'
              : 'border-emerald-300/25 bg-[#10231b]/95 text-emerald-100'
          }`}
        >
          {toast.tone === 'error' ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          )}
          <span className="flex-1 leading-5">{toast.message}</span>
          <button
            type="button"
            className="rounded-md p-0.5 text-slate-500 hover:text-slate-200"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

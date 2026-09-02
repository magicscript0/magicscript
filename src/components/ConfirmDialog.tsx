import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="panel w-full max-w-md">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 rounded-xl p-2 ${danger ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-300/10 text-amber-200'}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id="confirm-title" className="text-base font-semibold text-slate-100">{title}</h2>
              <button type="button" onClick={onCancel} aria-label="Close dialog" className="rounded-lg p-1 text-slate-500 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
              <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

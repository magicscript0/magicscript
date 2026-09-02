import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ToastViewport, type ToastMessage } from './Toast'

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((item) => item.id !== id))
  }, [])

  const add = useCallback((tone: ToastMessage['tone'], message: string) => {
    const id = nextToastId++
    setMessages((current) => [...current.slice(-3), { id, tone, message }])
    window.setTimeout(() => dismiss(id), 5500)
  }, [dismiss])

  const value = useMemo(() => ({
    success: (message: string) => add('success', message),
    error: (message: string) => add('error', message),
  }), [add])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport messages={messages} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}

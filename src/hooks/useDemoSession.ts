import { useCallback, useState } from 'react'

const STORAGE_KEY = 'apple-demo.operator-id'

function loadOperatorId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Demo session: keeps the operator ID in sessionStorage so a refresh does
 * not lose the session. No passwords are ever stored.
 */
export function useDemoSession() {
  const [operatorId, setOperatorId] = useState<string | null>(() => loadOperatorId())

  const login = useCallback((id: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* storage unavailable — session simply won't persist */
    }
    setOperatorId(id)
  }, [])

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setOperatorId(null)
  }, [])

  return { operatorId, login, logout }
}

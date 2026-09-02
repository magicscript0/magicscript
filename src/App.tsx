import { ErrorBoundary } from './components/ErrorBoundary'
import { useDemoSession } from './hooks/useDemoSession'
import { Console } from './pages/Console'
import { Login } from './pages/Login'

export default function App() {
  const { operatorId, login, logout } = useDemoSession()
  return (
    <ErrorBoundary>
      {operatorId === null ? <Login onLogin={login} /> : <Console operatorId={operatorId} onLogout={logout} />}
    </ErrorBoundary>
  )
}

import { useState, type FormEvent } from 'react'
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, LogIn, User } from 'lucide-react'
import { DemoBanner } from '../components/DemoBanner'
import { LOGIN_SIMULATION_MS } from '../config/game'
import { checkDemoPassword } from '../services/demoAuth'
import { validateOperatorId } from '../utils/validation'

export interface LoginProps {
  onLogin: (operatorId: string) => void
}

const INPUT_CLASSES =
  'h-12 w-full rounded-xl border border-slate-700 bg-slate-900/80 pl-11 pr-12 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:opacity-50'

/**
 * SCREEN 1 — Login (demo gate).
 * Any non-empty ID is accepted; the passcode comes from VITE_DEMO_PASSWORD
 * (.env) with a harmless demo default. This is a gate, NOT authentication.
 */
export function Login({ onLogin }: LoginProps) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return
    setError(null)

    const idCheck = validateOperatorId(id)
    if (!idCheck.valid) {
      setError(idCheck.errors[0])
      return
    }
    if (password.length === 0) {
      setError('Enter the demo password.')
      return
    }

    setChecking(true)
    // Simulated verification delay (visual parity with the original loader —
    // no real authentication happens here).
    window.setTimeout(() => {
      if (checkDemoPassword(password)) {
        onLogin(id.trim())
      } else {
        setChecking(false)
        setError('Incorrect demo password.')
      }
    }, LOGIN_SIMULATION_MS)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm animate-fade-in">
        {/* Branding */}
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-glow-safe">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-9 w-9">
              <path
                d="M32 16c-2-4-7-5-9-4 0 3 3 6 7 6-6 1-11 6-11 14 0 10 6 18 12 18 3 0 4-1 6-1s3 1 6 1c6 0 12-8 12-18 0-10-8-15-13-14-3 .6-7-3-10-2z"
                fill="#062f24"
              />
            </svg>
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-wide text-slate-100">
            APPLE CONSOLE
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
            Operator demo · simulation
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/30 backdrop-blur"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="operator-id"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Operator ID
              </label>
              <div className="relative">
                <User
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
                />
                <input
                  id="operator-id"
                  name="operator-id"
                  type="text"
                  autoComplete="username"
                  inputMode="text"
                  placeholder="Any ID works in the demo"
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                  disabled={checking}
                  className={INPUT_CLASSES}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="demo-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
                />
                <input
                  id="demo-password"
                  name="demo-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Demo passcode"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={checking}
                  className={INPUT_CLASSES}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={checking}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-300 animate-fade-in"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={checking}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-500 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-300 hover:to-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <LogIn aria-hidden="true" className="h-4 w-4" />
                Login
              </>
            )}
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
            DEMO access only — this gate is not real authentication. The passcode is set
            via <code className="text-slate-500">VITE_DEMO_PASSWORD</code> in your{' '}
            <code className="text-slate-500">.env</code>.
          </p>
        </form>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-600">
            Standalone simulation. No real money, no wagering, no connection to any betting
            platform.
          </p>
        </div>
      </div>
    </div>
  )
}

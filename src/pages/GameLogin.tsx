import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Clock3, Hash, KeyRound, LogOut, ShieldBan } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { CyberBackdrop } from '../components/CyberBackdrop'
import { GameSocialLinks } from '../components/GameSocialLinks'
import { describeAccessCodeIssue, describeAccountIdIssue, GameAccessError, normalizeAccountId } from '../services/gameAccess'
import type { GameAccessEndReason } from '../hooks/useGameAccess'

export interface GameLoginProps {
  onLogin: (accountId: string, accessCode: string) => Promise<void>
  /** Why the previous session ended (shown as a soft banner, if relevant). */
  endReason?: GameAccessEndReason
}

const INPUT_CLASSES = 'input h-12 pl-11 pr-3.5 tracking-[.02em]'

function endReasonNotice(reason: GameAccessEndReason): { icon: typeof Clock3; message: string } | null {
  if (reason === 'expired') return { icon: Clock3, message: 'Your previous access has expired. Enter a fresh Access Code to continue.' }
  if (reason === 'revoked') return { icon: ShieldBan, message: 'That access is no longer active. Enter a fresh Access Code to continue.' }
  if (reason === 'unverified') return { icon: AlertCircle, message: 'Access could not be verified. Check your connection and try again.' }
  return null
}

export function GameLogin({ onLogin, endReason = null }: GameLoginProps) {
  const [accountId, setAccountId] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Apple of Fortune · MAGIC SCRIPT'
  }, [])

  const notice = endReasonNotice(endReason)

  function handleAccountIdChange(value: string) {
    // The Account ID is a plain numeric identifier — keep digits only. The
    // 9–11 digit rule is enforced on submit so over-long input is rejected
    // visibly instead of being silently truncated.
    setAccountId(value.replace(/[^0-9]/g, ''))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return
    setError(null)

    const cleanAccountId = normalizeAccountId(accountId)
    const accountIdIssue = describeAccountIdIssue(cleanAccountId)
    if (accountIdIssue) {
      setError(accountIdIssue)
      return
    }
    const codeIssue = describeAccessCodeIssue(accessCode)
    if (codeIssue) {
      setError(codeIssue)
      return
    }

    setChecking(true)
    void onLogin(cleanAccountId, accessCode.trim())
      .catch((cause: unknown) => {
        setChecking(false)
        if (cause instanceof GameAccessError) {
          setError(cause.message)
          return
        }
        setError('Access could not be verified right now. Try again shortly.')
      })
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <CyberBackdrop />
      <div className="relative z-10 w-full max-w-[420px] page-enter">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-3 rounded-3xl bg-emerald-400/[.07] blur-xl" />
            <BrandMark />
          </div>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[.28em] text-emerald-300/80">MAGIC SCRIPT</p>
          <h1 className="mt-2 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-3xl font-semibold tracking-[-.05em] text-transparent drop-shadow-[0_0_28px_rgba(70,227,161,.15)]">Apple of Fortune</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your details to open the game.</p>
        </div>
        <div className="game-card p-5 sm:p-7">
          <form onSubmit={handleSubmit} noValidate>
            {notice && (
              <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3.5 py-3">
                <notice.icon className="h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-xs leading-5 text-amber-100/90">{notice.message}</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="account-id" className="field-label">Account ID</label>
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    id="account-id"
                    name="accountId"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={accountId}
                    onChange={(event) => handleAccountIdChange(event.target.value)}
                    disabled={checking}
                    className={`${INPUT_CLASSES} mono`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="access-code" className="field-label">Access Code</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    id="access-code"
                    name="accessCode"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="Enter the code you received"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    disabled={checking}
                    className={`${INPUT_CLASSES} mono uppercase`}
                  />
                </div>
              </div>
            </div>
            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-3.5 py-3 text-xs leading-5 text-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                {error}
              </div>
            )}
            <button type="submit" disabled={checking} aria-label={checking ? 'Checking access' : 'Enter game'} className="btn-primary mt-5 min-h-12 w-full text-sm shadow-[0_10px_32px_rgba(23,191,127,.28)]">
              {checking ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#06251a]/30 border-t-[#06251a]" />
                  Checking access…
                </>
              ) : (
                <>
                  Enter game
                  <ArrowRight className="ml-auto h-4 w-4" />
                </>
              )}
            </button>
            {endReason === 'ended' && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-600">
                <LogOut className="h-3 w-3" /> You signed out of the game.
              </p>
            )}
          </form>
          <div className="mt-6">
            <GameSocialLinks />
          </div>
        </div>
      </div>
    </main>
  )
}

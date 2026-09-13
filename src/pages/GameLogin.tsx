import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Check, Clock3, Eye, EyeOff, Hash, KeyRound, LogOut, ShieldBan } from 'lucide-react'
import { CyberBackdrop } from '../components/CyberBackdrop'
import { GameBrandLockup } from '../components/GameBrand'
import { GameSocialLinks } from '../components/GameSocialLinks'
import { PublicGameHud } from '../components/PublicGameHud'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import { describeAccessCodeIssue, describeAccountIdIssue, GameAccessError, normalizeAccountId } from '../services/gameAccess'
import type { GameAccessEndReason } from '../hooks/useGameAccess'
import type { ControlSettings } from '../types/supabase'

export interface GameLoginProps {
  onLogin: (accountId: string, accessCode: string) => Promise<void>
  /** Why the previous session ended (shown as a soft banner, if relevant). */
  endReason?: GameAccessEndReason
  /**
   * Render the ambient cyber backdrop. The game flow owns one shared backdrop
   * for the boot screen and the login (so the particle field never restarts
   * mid-transition) and passes `false` here; standalone usage keeps it.
   */
  ambient?: boolean
  /** Admin-controlled public presentation settings (title, caption, links, HUD). */
  settings?: ControlSettings
  /**
   * Fired the instant `onLogin` RESOLVES — i.e. after the server has accepted
   * the code — so the terminal can show ACCESS VERIFIED and begin its
   * dissolve. The caller owns the hand-off: it schedules the short cinematic
   * hold and then navigates, which keeps the authentication sequence itself
   * exactly the same.
   */
  onGrant?: () => void
}

function endReasonNotice(reason: GameAccessEndReason): { icon: typeof Clock3; message: string } | null {
  if (reason === 'expired') return { icon: Clock3, message: 'Your previous access has expired. Enter a fresh Access Code to continue.' }
  if (reason === 'revoked') return { icon: ShieldBan, message: 'That access is no longer active. Enter a fresh Access Code to continue.' }
  if (reason === 'unverified') return { icon: AlertCircle, message: 'Access could not be verified. Check your connection and try again.' }
  return null
}

/**
 * PUBLIC GAME LOGIN — presentation layer.
 *
 * Behaviour is exactly the existing one: the same client-side format checks,
 * the same `onLogin` hand-off to the access hook, the same disabled/busy
 * states and the same end-of-session notices. The visuals consume the
 * admin-controlled public settings (title, caption, status label, social
 * links, live-activity estimate and local time) with safe defaults when none
 * are supplied.
 *
 * Presentation additions (this redesign): the access code is masked with an
 * elegant show/hide control, the button mirrors the real verification states
 * (ENTER GAME → VERIFYING ACCESS → ACCESS VERIFIED), and on success the
 * terminal dissolves while the caller schedules the hand-off into the game.
 * No animation here decides whether access is granted — the verdict is still
 * the server's, delivered through `onLogin` exactly as before.
 */
export function GameLogin({
  onLogin,
  endReason = null,
  ambient = true,
  settings = DEFAULT_CONTROL_SETTINGS,
  onGrant,
}: GameLoginProps) {
  const [accountId, setAccountId] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [verified, setVerified] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Apple of Fortune · MAGIC SCRIPT'
  }, [])

  const notice = endReasonNotice(endReason)
  const locked = checking || verified

  function handleAccountIdChange(value: string) {
    // The Account ID is a plain numeric identifier — keep digits only. The
    // 9–11 digit rule is enforced on submit so over-long input is rejected
    // visibly instead of being silently truncated.
    setAccountId(value.replace(/[^0-9]/g, ''))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return
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
      .then(() => {
        // Real success — the server already accepted this code. Show the
        // verified beat and let the caller schedule the transition; the
        // session is already granted, this is presentation timing only.
        setChecking(false)
        setVerified(true)
        onGrant?.()
      })
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
    <main
      className={`pg-login relative flex items-center justify-center overflow-x-hidden${ambient ? ' pg-login--solo' : ''}${verified ? ' pg-login--granted' : ''}`}
    >
      {ambient ? <CyberBackdrop /> : null}

      {/* Faint system lines framing the terminal — decorative depth only. */}
      <div className="pg-login__frame" aria-hidden="true" />
      {/* Light bloom that plays once as the terminal dissolves into the game. */}
      <span className="pg-login__bloom" aria-hidden="true" />

      <PublicGameHud display={settings.display} className="pg-hud--login" />

      <div className="pg-login__stack relative z-10 w-full max-w-[452px]">
        <GameBrandLockup
          title={settings.login.title}
          caption={settings.login.caption || undefined}
          status="System operational"
        />

        <div className="pg-panel">
          <span className="pg-panel__corner pg-panel__corner--tl" aria-hidden="true" />
          <span className="pg-panel__corner pg-panel__corner--tr" aria-hidden="true" />
          <span className="pg-panel__corner pg-panel__corner--bl" aria-hidden="true" />
          <span className="pg-panel__corner pg-panel__corner--br" aria-hidden="true" />

          <div className="pg-panel__body">
            <div className="pg-panel__head">
              <p className="pg-eyebrow">Secure access</p>
              <span className="pg-panel__rule" aria-hidden="true" />
              {settings.login.showStatus && (
                <span className="pg-panel__state">
                  <span className="pg-dot" aria-hidden="true" />
                  {settings.login.statusLabel || 'Ready'}
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {notice && (
                <div role="status" className="pg-note pg-note--warn">
                  <notice.icon className="pg-note__icon" aria-hidden="true" />
                  <p>{notice.message}</p>
                </div>
              )}

              <div className="pg-fields">
                <div className="pg-field">
                  <label htmlFor="account-id" className="pg-label">Account ID</label>
                  <div className="pg-slot">
                    <Hash className="pg-slot__icon" aria-hidden="true" />
                    <input
                      id="account-id"
                      name="accountId"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={accountId}
                      onChange={(event) => handleAccountIdChange(event.target.value)}
                      disabled={locked}
                      className="pg-input mono"
                    />
                  </div>
                </div>

                <div className="pg-field">
                  <label htmlFor="access-code" className="pg-label">Access Code</label>
                  <div className="pg-slot">
                    <KeyRound className="pg-slot__icon" aria-hidden="true" />
                    <input
                      id="access-code"
                      name="accessCode"
                      type={showCode ? 'text' : 'password'}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="Enter the code you received"
                      value={accessCode}
                      onChange={(event) => setAccessCode(event.target.value)}
                      disabled={locked}
                      className="pg-input mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((value) => !value)}
                      disabled={locked}
                      aria-label={showCode ? 'Hide access code' : 'Show access code'}
                      aria-pressed={showCode}
                      className="pg-code-toggle"
                    >
                      {showCode ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div role="alert" className="pg-note pg-note--error">
                  <AlertCircle className="pg-note__icon" aria-hidden="true" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={locked}
                aria-label={checking ? 'Verifying access' : verified ? 'Access verified' : 'Enter game'}
                className={`pg-btn pg-btn--primary${checking ? ' is-busy' : ''}${verified ? ' is-verified' : ''}`}
              >
                {checking ? (
                  <>
                    <span className="pg-btn__spinner" />
                    <span>Verifying access</span>
                  </>
                ) : verified ? (
                  <>
                    <Check className="pg-btn__check" aria-hidden="true" />
                    <span>Access verified</span>
                  </>
                ) : (
                  <>
                    <span>Enter game</span>
                    <ArrowRight className="pg-btn__arrow" aria-hidden="true" />
                  </>
                )}
              </button>

              {endReason === 'ended' && (
                <p className="pg-login__foot">
                  <LogOut className="h-3 w-3" aria-hidden="true" /> You signed out of the game.
                </p>
              )}
            </form>

            <GameSocialLinks links={settings.social} />
          </div>
        </div>

        {/* Secondary system readouts — presentational, never data. */}
        <div className="pg-login__meta" aria-hidden="true">
          <span>Game session</span>
          <span className="pg-login__meta-sep" />
          <span>Access control</span>
          <span className="pg-login__meta-sep" />
          <span>System ready</span>
        </div>

        <p className="pg-login__brand-foot">© MAGIC SCRIPT</p>
      </div>
    </main>
  )
}

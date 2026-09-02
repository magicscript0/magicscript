import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Clipboard, Copy, Plus, ShieldCheck, Ticket, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useToast } from '../components/ToastProvider'
import {
  GAME_ACCESS_DURATION_LIMITS,
  GAME_ACCESS_DURATION_OPTIONS,
  createGameAccessCode,
  formatDurationMinutes,
  gameAccessCodeStatus,
  listGameAccessCodes,
  revokeGameAccessCode,
  type CreatedGameAccessCode,
} from '../services/gameAccess'
import { recordActivity } from '../services/activity'
import { friendlyControlError } from '../services/supabase'
import type { GameAccessCodeSummary, AdminProfile } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'

const CUSTOM_PRESET = 'custom' as const

export function GameAccessPage({ admin }: { admin: AdminProfile }) {
  const { success, error } = useToast()
  const [codes, setCodes] = useState<GameAccessCodeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [revealed, setRevealed] = useState<{ code: string; id: string } | null>(null)
  const [confirmingRevoke, setConfirmingRevoke] = useState<GameAccessCodeSummary | null>(null)

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      setCodes(await listGameAccessCodes())
      setLoadError(null)
    } catch (cause) {
      setLoadError(friendlyControlError(cause, 'Game access codes could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCodes() }, [loadCodes])

  async function confirmRevoke() {
    if (!confirmingRevoke) return
    try {
      await revokeGameAccessCode(confirmingRevoke.id)
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'REVOKE_GAME_ACCESS_CODE', { code_id: confirmingRevoke.id })
      } catch (cause) {
        auditError = friendlyControlError(cause, 'The code was revoked, but the audit event could not be recorded.')
      }
      success('Game access code revoked. Active sessions using it are cut off at their next check.')
      if (auditError) error(`Code revoked, but audit logging failed: ${auditError}`)
      setConfirmingRevoke(null)
      await loadCodes()
    } catch (cause) {
      error(friendlyControlError(cause, 'The game access code could not be revoked.'))
    }
  }

  const activeCount = useMemo(() => codes.filter((code) => gameAccessCodeStatus(code) === 'active').length, [codes])
  const closedCount = useMemo(() => codes.filter((code) => ['expired', 'revoked', 'inactive'].includes(gameAccessCodeStatus(code))).length, [codes])

  return <>
    <PageHeader
      eyebrow="Access / Apple of Fortune"
      title="Game access codes"
      description="Issue time-bound Access Codes for the Apple of Fortune game console. A code controls how long an end user may play; expiration is enforced server-side."
      action={<button type="button" className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create access code</button>}
    />
    <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-lg">
      <div className="panel p-4"><p className="eyebrow">Active now</p><p className="mono mt-2 text-2xl font-semibold text-emerald-200">{loading ? '—' : activeCount}</p></div>
      <div className="panel p-4"><p className="eyebrow">Expired / revoked</p><p className="mono mt-2 text-2xl font-semibold text-slate-300">{loading ? '—' : closedCount}</p></div>
    </div>
    {revealed && <OneTimeAccessCode code={revealed.code} onClose={() => setRevealed(null)} onCopied={() => success('Access code copied to clipboard.')} />}
    {loadError && <div className="mb-5"><InlineError message={loadError} onRetry={() => { void loadCodes() }} /></div>}
    <section className="panel p-0 sm:p-0">
      <div className="p-4 sm:p-5"><PanelHeading icon={Ticket} title="Access code inventory" description="Only hashes are stored — plaintext codes are shown exactly once, right after creation." /></div>
      {loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={5} /></div> : codes.length === 0 ? (
        <EmptyState icon={Ticket} title="No game access codes yet" description="Create a code to let an end user into Apple of Fortune for a limited time." action={<button type="button" className="btn-secondary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create first code</button>} />
      ) : (
        <AccessCodeTable codes={codes} onRevoke={setConfirmingRevoke} />
      )}
    </section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.045] px-4 py-3 text-xs leading-5 text-cyan-100">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
      <p><strong className="font-semibold">How access works.</strong> The end user signs in at the game screen with an Account ID (9–11 digits) plus one of these codes. The session ends automatically at the code expiry, when you revoke it, or when the browser can no longer verify it.</p>
    </div>
    <CreateAccessCodeDialog
      open={showCreate}
      admin={admin}
      onClose={() => setShowCreate(false)}
      onCreated={(created) => {
        setShowCreate(false)
        setRevealed({ code: created.plainCode, id: created.record.id })
        setCodes((current) => [created.record, ...current])
        success('Game access code created. Copy it now; it will not be shown again.')
      }}
      onError={error}
    />
    <ConfirmDialog
      open={confirmingRevoke !== null}
      title="Revoke this access code?"
      message="End users using this code lose access at their next check (within about 30 seconds). This cannot be undone."
      confirmLabel="Revoke code"
      danger
      onConfirm={() => { void confirmRevoke() }}
      onCancel={() => setConfirmingRevoke(null)}
    />
  </>
}

function AccessCodeTable({ codes, onRevoke }: { codes: GameAccessCodeSummary[]; onRevoke: (code: GameAccessCodeSummary) => void }) {
  return <div className="table-wrap rounded-t-none border-x-0 border-b-0"><table className="data-table">
    <thead><tr><th>Code</th><th>Validity</th><th>Status</th><th>Created</th><th>Expires</th><th>Uses</th><th>Last account</th><th className="text-right">Actions</th></tr></thead>
    <tbody className="divide-y divide-white/[.06]">
      {codes.map((code) => <AccessCodeRow key={code.id} code={code} onRevoke={onRevoke} />)}
    </tbody>
  </table></div>
}

function AccessCodeRow({ code, onRevoke }: { code: GameAccessCodeSummary; onRevoke: (code: GameAccessCodeSummary) => void }) {
  const status = gameAccessCodeStatus(code)
  const tone = status === 'active' ? 'success' : status === 'expired' ? 'warning' : status === 'revoked' ? 'danger' : 'neutral'
  return <tr>
    <td><span className="mono text-xs text-slate-400">MS-••••-••••</span></td>
    <td className="whitespace-nowrap text-xs">{formatDurationMinutes(code.duration_minutes)}</td>
    <td><StatusBadge label={status} tone={tone} /></td>
    <td className="whitespace-nowrap text-xs">{formatRelativeTime(code.created_at)}</td>
    <td className="whitespace-nowrap text-xs">{new Date(code.expires_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
    <td className="mono whitespace-nowrap text-xs">{code.uses_count}</td>
    <td className="whitespace-nowrap text-xs">{code.account_id ? <span className="mono text-slate-300">{code.account_id}</span> : <span className="text-slate-600">—</span>}{code.redeemed_at && <p className="mt-0.5 text-[10px] text-slate-600">{formatRelativeTime(code.redeemed_at)}</p>}</td>
    <td>
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200 disabled:opacity-30"
          onClick={() => onRevoke(code)}
          disabled={status === 'revoked' || status === 'expired'}
          aria-label="Revoke access code"
          title="Revoke"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </td>
  </tr>
}

function OneTimeAccessCode({ code, onClose, onCopied }: { code: string; onClose: () => void; onCopied: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      onCopied()
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard permission is optional; the code stays visible for manual copying. */
    }
  }
  return <div className="mb-5 rounded-2xl border border-emerald-300/25 bg-emerald-300/[.07] p-4 shadow-[0_0_34px_rgba(70,227,161,.08)] sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200"><Clipboard className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-emerald-100">New access code ready</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-emerald-200/60 hover:text-emerald-100" aria-label="Close code notice"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs leading-5 text-emerald-100/65">Share this code with the end user. For security, the plaintext disappears when you dismiss this notice.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <code className="mono flex min-h-11 flex-1 items-center rounded-xl border border-emerald-300/20 bg-black/20 px-3 text-sm tracking-[.16em] text-emerald-100">{code}</code>
          <button type="button" className="btn-primary shrink-0" onClick={() => { void copy() }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy code'}</button>
        </div>
      </div>
    </div>
  </div>
}

function CreateAccessCodeDialog({ open, admin, onClose, onCreated, onError }: { open: boolean; admin: AdminProfile; onClose: () => void; onCreated: (created: CreatedGameAccessCode) => void; onError: (message: string) => void }) {
  const [preset, setPreset] = useState<number | typeof CUSTOM_PRESET>(60)
  const [customMinutes, setCustomMinutes] = useState(45)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const durationMinutes = preset === CUSTOM_PRESET ? customMinutes : preset
  const validDuration = Number.isInteger(durationMinutes) && durationMinutes >= GAME_ACCESS_DURATION_LIMITS.min && durationMinutes <= GAME_ACCESS_DURATION_LIMITS.max
  const expiresPreview = validDuration ? new Date(Date.now() + durationMinutes * 60_000) : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validDuration) {
      onError(`Duration must be between ${GAME_ACCESS_DURATION_LIMITS.min} and ${GAME_ACCESS_DURATION_LIMITS.max} minutes.`)
      return
    }
    setSaving(true)
    try {
      const created = await createGameAccessCode(durationMinutes, admin.id)
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'CREATE_GAME_ACCESS_CODE', { code_id: created.record.id, duration_minutes: durationMinutes, expires_at: created.record.expires_at })
      } catch (cause) {
        auditError = friendlyControlError(cause, 'The code was created, but the audit event could not be recorded.')
      }
      onCreated(created)
      if (auditError) onError(`Access code created, but audit logging failed: ${auditError}`)
    } catch (cause) {
      onError(friendlyControlError(cause, 'The game access code could not be created.'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <form role="dialog" aria-modal="true" aria-labelledby="create-access-code-title" onSubmit={(event) => { void submit(event) }} className="panel w-full max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Apple of Fortune</p>
          <h2 id="create-access-code-title" className="mt-1 text-lg font-semibold text-slate-100">Create access code</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:text-slate-200" aria-label="Close create access code dialog"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">The code is generated locally with secure randomness and only its hash is stored. Access ends automatically at expiry — the expiry timestamp is computed by the server.</p>
      <div className="mt-5 space-y-4">
        <div>
          <span className="field-label">Validity duration</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Validity duration">
            {GAME_ACCESS_DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preset === option.value}
                onClick={() => setPreset(option.value)}
                className={`min-h-10 rounded-xl border px-2 text-xs font-semibold transition ${preset === option.value ? 'border-emerald-300/50 bg-emerald-300/[.12] text-emerald-100' : 'border-white/[.09] bg-white/[.02] text-slate-400 hover:border-white/[.18] hover:text-slate-200'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="access-duration-custom" className="field-label">Custom duration (minutes)</label>
          <input
            id="access-duration-custom"
            className="input mono"
            type="number"
            min={GAME_ACCESS_DURATION_LIMITS.min}
            max={GAME_ACCESS_DURATION_LIMITS.max}
            value={customMinutes}
            onChange={(event) => { setCustomMinutes(Number(event.target.value)); setPreset(CUSTOM_PRESET) }}
            onFocus={() => setPreset(CUSTOM_PRESET)}
          />
        </div>
        <div className="rounded-xl border border-white/[.07] bg-black/10 px-3.5 py-3 text-xs leading-5 text-slate-400">
          {validDuration && expiresPreview
            ? <>Valid for <span className="font-semibold text-slate-200">{formatDurationMinutes(durationMinutes)}</span> · expires around <span className="font-semibold text-slate-200">{expiresPreview.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> (server clock).</>
            : <>Enter a duration between {GAME_ACCESS_DURATION_LIMITS.min} and {GAME_ACCESS_DURATION_LIMITS.max} minutes.</>}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-white/[.07] pt-5">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <SaveButton saving={saving}>Generate access code</SaveButton>
      </div>
    </form>
  </div>
}

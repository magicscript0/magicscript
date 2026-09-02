import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, FileKey2, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useToast } from '../components/ToastProvider'
import { adminCodeStatus, createAdminCode, deleteAdminCode, listAdminCodes, revokeAdminCode, setAdminCodeActive, type CodeExpiryPreset } from '../services/adminCodes'
import { recordActivity } from '../services/activity'
import type { AdminCodeSummary, AdminProfile, AdminRole } from '../types/supabase'
import { formatRelativeTime } from '../utils/time'
import { roleLabel } from '../utils/permissions'

const EXPIRY_OPTIONS: Array<{ value: CodeExpiryPreset; label: string; hours?: number }> = [
  { value: '1h', label: '1 hour', hours: 1 },
  { value: '6h', label: '6 hours', hours: 6 },
  { value: '12h', label: '12 hours', hours: 12 },
  { value: '1d', label: '1 day', hours: 24 },
  { value: '7d', label: '7 days', hours: 168 },
  { value: '30d', label: '30 days', hours: 720 },
  { value: 'custom', label: 'Custom date' },
]

export function AdminCodesPage({ admin }: { admin: AdminProfile }) {
  const { success, error } = useToast()
  const [codes, setCodes] = useState<AdminCodeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [revealed, setRevealed] = useState<{ code: string; id: string } | null>(null)
  const [confirming, setConfirming] = useState<{ action: 'revoke' | 'delete'; code: AdminCodeSummary } | null>(null)

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      setCodes(await listAdminCodes())
      setLoadError(null)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Admin codes could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCodes() }, [loadCodes])

  async function confirmAction() {
    if (!confirming) return
    try {
      if (confirming.action === 'revoke') {
        await revokeAdminCode(confirming.code.id)
        await recordActivity(admin.id, 'REVOKE_ADMIN_CODE', { code_id: confirming.code.id }).catch(() => undefined)
        success('Admin code revoked.')
      } else {
        await deleteAdminCode(confirming.code.id)
        await recordActivity(admin.id, 'DELETE_ADMIN_CODE', { code_id: confirming.code.id }).catch(() => undefined)
        success('Admin code deleted.')
      }
      setConfirming(null)
      await loadCodes()
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'The admin code action could not be completed.')
    }
  }

  async function toggleCode(code: AdminCodeSummary) {
    try {
      await setAdminCodeActive(code.id, !code.active)
      await recordActivity(admin.id, code.active ? 'DEACTIVATE_ADMIN_CODE' : 'ACTIVATE_ADMIN_CODE', { code_id: code.id }).catch(() => undefined)
      success(code.active ? 'Admin code deactivated.' : 'Admin code activated.')
      await loadCodes()
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'The admin code status could not be updated.')
    }
  }

  const activeCount = useMemo(() => codes.filter((code) => adminCodeStatus(code) === 'active').length, [codes])
  const expiredCount = useMemo(() => codes.filter((code) => ['expired', 'exhausted', 'revoked'].includes(adminCodeStatus(code))).length, [codes])

  return <>
    <PageHeader eyebrow="Access / time-bound credentials" title="Admin codes" description="Issue short-lived access records without persisting plaintext secrets. A newly created code is shown once for copying." action={<button type="button" className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create code</button>} />
    <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-lg"><div className="panel p-4"><p className="eyebrow">Active now</p><p className="mono mt-2 text-2xl font-semibold text-emerald-200">{loading ? '—' : activeCount}</p></div><div className="panel p-4"><p className="eyebrow">Closed records</p><p className="mono mt-2 text-2xl font-semibold text-slate-300">{loading ? '—' : expiredCount}</p></div></div>
    {revealed && <OneTimeCode code={revealed.code} onClose={() => setRevealed(null)} onCopied={() => success('Code copied to clipboard.')} />}
    {loadError && <div className="mb-5"><InlineError message={loadError} onRetry={() => { void loadCodes() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={FileKey2} title="Code inventory" description="Hashes are retained for verification; plaintext codes never appear in this table." /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={5} /></div> : codes.length === 0 ? <EmptyState icon={FileKey2} title="No access codes yet" description="Create a code when another administrator needs time-bound access." action={<button type="button" className="btn-secondary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create first code</button>} /> : <CodeTable codes={codes} onToggle={toggleCode} onRevoke={(code) => setConfirming({ action: 'revoke', code })} onDelete={(code) => setConfirming({ action: 'delete', code })} />}</section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.045] px-4 py-3 text-xs leading-5 text-cyan-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p><strong className="font-semibold">Security note.</strong> Codes are SHA-256 hashed with Web Crypto before the insert. Verification belongs in the server-side Edge Function; the browser only holds a fresh code in memory long enough to copy it.</p></div>
    <CreateCodeDialog open={showCreate} admin={admin} onClose={() => setShowCreate(false)} onCreated={(created) => { setShowCreate(false); setRevealed({ code: created.plainCode, id: created.record.id }); setCodes((current) => [created.record, ...current]); success('Admin code created. Copy it now; it will not be shown again.'); }} onError={error} />
    <ConfirmDialog open={confirming !== null} title={confirming?.action === 'delete' ? 'Delete this code?' : 'Revoke this code?'} message={confirming?.action === 'delete' ? 'The record will be removed from the control plane. This cannot be undone.' : 'This code will stop working immediately, even if it has not expired.'} confirmLabel={confirming?.action === 'delete' ? 'Delete code' : 'Revoke code'} danger onConfirm={() => { void confirmAction() }} onCancel={() => setConfirming(null)} />
  </>
}

function CodeTable({ codes, onToggle, onRevoke, onDelete }: { codes: AdminCodeSummary[]; onToggle: (code: AdminCodeSummary) => void; onRevoke: (code: AdminCodeSummary) => void; onDelete: (code: AdminCodeSummary) => void }) {
  return <div className="table-wrap rounded-t-none border-x-0 border-b-0"><table className="data-table"><thead><tr><th>Code</th><th>Role</th><th>Status</th><th>Expires</th><th>Usage</th><th className="text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/[.06]">{codes.map((code) => <CodeRow key={code.id} code={code} onToggle={onToggle} onRevoke={onRevoke} onDelete={onDelete} />)}</tbody></table></div>
}

function CodeRow({ code, onToggle, onRevoke, onDelete }: { code: AdminCodeSummary; onToggle: (code: AdminCodeSummary) => void; onRevoke: (code: AdminCodeSummary) => void; onDelete: (code: AdminCodeSummary) => void }) {
  const status = adminCodeStatus(code)
  const statusTone = status === 'active' ? 'success' : status === 'expired' || status === 'exhausted' ? 'warning' : status === 'revoked' ? 'danger' : 'neutral'
  return <tr><td><span className="mono text-xs text-slate-400">MS-••••-••••</span><p className="mt-1 text-[10px] text-slate-600">Created {formatRelativeTime(code.created_at)}</p></td><td><span className="text-xs font-semibold text-slate-300">{roleLabel(code.role)}</span></td><td><StatusBadge label={status} tone={statusTone} /></td><td className="whitespace-nowrap text-xs">{code.expires_at ? new Date(code.expires_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}</td><td className="mono whitespace-nowrap text-xs">{code.uses_count} / {code.max_uses}</td><td><div className="flex justify-end gap-1.5"><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-white/[.06] hover:text-slate-200" onClick={() => onToggle(code)} disabled={status === 'expired' || status === 'revoked' || status === 'exhausted'} aria-label={code.active ? 'Deactivate code' : 'Activate code'} title={code.active ? 'Deactivate' : 'Activate'}><Check className={`h-4 w-4 ${code.active ? 'text-emerald-300' : ''}`} /></button><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200" onClick={() => onRevoke(code)} disabled={status === 'revoked'} aria-label="Revoke code" title="Revoke"><X className="h-4 w-4" /></button><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200" onClick={() => onDelete(code)} aria-label="Delete code" title="Delete"><Trash2 className="h-4 w-4" /></button></div></td></tr>
}

function OneTimeCode({ code, onClose, onCopied }: { code: string; onClose: () => void; onCopied: () => void }) {
  async function copy() {
    try { await navigator.clipboard.writeText(code); onCopied() } catch { /* Clipboard permission is optional. */ }
  }
  return <div className="mb-5 rounded-2xl border border-emerald-300/25 bg-emerald-300/[.07] p-4 shadow-[0_0_34px_rgba(70,227,161,.08)] sm:p-5"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200"><Clipboard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-emerald-100">New code ready</p><button type="button" onClick={onClose} className="rounded-lg p-1 text-emerald-200/60 hover:text-emerald-100" aria-label="Close code notice"><X className="h-4 w-4" /></button></div><p className="mt-1 text-xs leading-5 text-emerald-100/65">Copy this code now. For security, the plaintext will disappear when you dismiss this notice.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><code className="mono flex min-h-11 flex-1 items-center rounded-xl border border-emerald-300/20 bg-black/20 px-3 text-sm tracking-[.16em] text-emerald-100">{code}</code><button type="button" className="btn-primary shrink-0" onClick={() => { void copy() }}><Copy className="h-4 w-4" /> Copy code</button></div></div></div></div>
}

function CreateCodeDialog({ open, admin, onClose, onCreated, onError }: { open: boolean; admin: AdminProfile; onClose: () => void; onCreated: (created: Awaited<ReturnType<typeof createAdminCode>>) => void; onError: (message: string) => void }) {
  const [role, setRole] = useState<AdminRole>('operator')
  const [expiry, setExpiry] = useState<CodeExpiryPreset>('1d')
  const [customExpiry, setCustomExpiry] = useState('')
  const [maxUses, setMaxUses] = useState(1)
  const [saving, setSaving] = useState(false)

  if (!open) return null
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const option = EXPIRY_OPTIONS.find((item) => item.value === expiry)
      const expiresAt = expiry === 'custom' ? (customExpiry ? new Date(customExpiry).toISOString() : null) : option?.hours ? new Date(Date.now() + option.hours * 60 * 60 * 1000).toISOString() : null
      if (expiry === 'custom' && (!expiresAt || Date.parse(expiresAt) <= Date.now())) throw new Error('Choose a future custom expiration date.')
      const created = await createAdminCode({ role, expiresAt, maxUses }, admin.id)
      await recordActivity(admin.id, 'CREATE_ADMIN_CODE', { code_id: created.record.id, role, expires_at: expiresAt, max_uses: maxUses }).catch(() => undefined)
      onCreated(created)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Admin code could not be created.')
    } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><form role="dialog" aria-modal="true" aria-labelledby="create-code-title" onSubmit={(event) => { void submit(event) }} className="panel w-full max-w-lg"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Access management</p><h2 id="create-code-title" className="mt-1 text-lg font-semibold text-slate-100">Create admin code</h2></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:text-slate-200" aria-label="Close create code dialog"><X className="h-5 w-5" /></button></div><p className="mt-3 text-xs leading-5 text-slate-500">The raw code is generated locally with secure randomness, hashed, then stored. It is revealed only after a successful insert.</p><div className="mt-5 space-y-4"><div><label htmlFor="code-role" className="field-label">Role</label><select id="code-role" className="select" value={role} onChange={(event) => setRole(event.target.value as AdminRole)}><option value="operator">OPERATOR</option><option value="admin">ADMIN</option>{admin.role === 'super_admin' && <option value="super_admin">SUPER ADMIN</option>}</select></div><div><label htmlFor="code-expiry" className="field-label">Expiration</label><select id="code-expiry" className="select" value={expiry} onChange={(event) => setExpiry(event.target.value as CodeExpiryPreset)}>{EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>{expiry === 'custom' && <div><label htmlFor="custom-expiry" className="field-label">Custom expiration</label><input id="custom-expiry" className="input" type="datetime-local" value={customExpiry} onChange={(event) => setCustomExpiry(event.target.value)} /></div>}<div><label htmlFor="max-uses" className="field-label">Maximum uses</label><input id="max-uses" className="input mono" type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></div></div><div className="mt-6 flex justify-end gap-2 border-t border-white/[.07] pt-5"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><SaveButton saving={saving}>Generate code</SaveButton></div></form></div>
}

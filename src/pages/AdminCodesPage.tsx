import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, FileKey2, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, InlineError, LoadingRows, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useToast } from '../components/ToastProvider'
import { adminCodeStatus, createAdminCode, deleteAdminCode, listAdminCodes, revokeAdminCode, setAdminCodeActive, type CodeExpiryPreset } from '../services/adminCodes'
import { recordActivity } from '../services/activity'
import { ADMIN_CODE_STATUS_LABELS_AR, adminErrorMessage, formatDateTimeArabic, relativeTimeArabic } from '../i18n/dashboard'
import type { AdminCodeSummary, AdminProfile, AdminRole } from '../types/supabase'
import { roleLabel } from '../utils/permissions'

const EXPIRY_OPTIONS: Array<{ value: CodeExpiryPreset; label: string; hours?: number }> = [
  { value: '1h', label: 'ساعة واحدة', hours: 1 },
  { value: '6h', label: '6 ساعات', hours: 6 },
  { value: '12h', label: '12 ساعة', hours: 12 },
  { value: '1d', label: 'يوم واحد', hours: 24 },
  { value: '7d', label: '7 أيام', hours: 168 },
  { value: '30d', label: '30 يوم', hours: 720 },
  { value: 'custom', label: 'تاريخ مخصص' },
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
      setLoadError(adminErrorMessage(cause, 'تعذر تحميل أكواد الإدارة. حاول مرة أخرى.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCodes() }, [loadCodes])

  async function confirmAction() {
    if (!confirming) return
    try {
      let auditError: string | null = null
      if (confirming.action === 'revoke') {
        await revokeAdminCode(confirming.code.id)
        try {
          await recordActivity(admin.id, 'REVOKE_ADMIN_CODE', { code_id: confirming.code.id })
        } catch (cause) {
          auditError = adminErrorMessage(cause, 'تم إلغاء الكود، لكن تعذر تسجيل الحدث في سجل النشاط.')
        }
        success('تم إلغاء كود الإدارة.')
      } else {
        await deleteAdminCode(confirming.code.id)
        try {
          await recordActivity(admin.id, 'DELETE_ADMIN_CODE', { code_id: confirming.code.id })
        } catch (cause) {
          auditError = adminErrorMessage(cause, 'تم حذف الكود، لكن تعذر تسجيل الحدث في سجل النشاط.')
        }
        success('تم حذف كود الإدارة.')
      }
      if (auditError) error(auditError)
      setConfirming(null)
      await loadCodes()
    } catch (cause) {
      error(adminErrorMessage(cause, 'تعذر إتمام العملية على الكود. حاول مرة أخرى.'))
    }
  }

  async function toggleCode(code: AdminCodeSummary) {
    try {
      await setAdminCodeActive(code.id, !code.active)
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, code.active ? 'DEACTIVATE_ADMIN_CODE' : 'ACTIVATE_ADMIN_CODE', { code_id: code.id })
      } catch (cause) {
        auditError = adminErrorMessage(cause, 'تم تغيير حالة الكود، لكن تعذر تسجيل الحدث في سجل النشاط.')
      }
      success(code.active ? 'تم إيقاف الكود مؤقتًا.' : 'تم تفعيل الكود.')
      if (auditError) error(auditError)
      await loadCodes()
    } catch (cause) {
      error(adminErrorMessage(cause, 'تعذر تحديث حالة الكود. حاول مرة أخرى.'))
    }
  }

  const activeCount = useMemo(() => codes.filter((code) => adminCodeStatus(code) === 'active').length, [codes])
  const expiredCount = useMemo(() => codes.filter((code) => ['expired', 'exhausted', 'revoked'].includes(adminCodeStatus(code))).length, [codes])

  return <>
    <PageHeader eyebrow="التشغيل / أكواد الإدارة" title="أكواد الإدارة" description="من هنا بتعمل أكواد مؤقتة للدخول إلى لوحة التحكم. الكود الجديد بيظهر مرة واحدة فقط للنسخ." action={<button type="button" className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> إنشاء كود جديد</button>} />
    <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-lg"><div className="panel p-4"><p className="eyebrow">نشطة الآن</p><p className="mono mt-2 text-2xl font-semibold text-emerald-200">{loading ? '—' : activeCount}</p></div><div className="panel p-4"><p className="eyebrow">أكواد مغلقة</p><p className="mono mt-2 text-2xl font-semibold text-slate-300">{loading ? '—' : expiredCount}</p></div></div>
    {revealed && <OneTimeCode code={revealed.code} onClose={() => setRevealed(null)} onCopied={() => success('تم نسخ الكود.')} />}
    {loadError && <div className="mb-5"><InlineError message={loadError} onRetry={() => { void loadCodes() }} /></div>}
    <section className="panel p-0 sm:p-0"><div className="p-4 sm:p-5"><PanelHeading icon={FileKey2} title="الأكواد الحالية" description="بنحفظ بصمات الأكواد للتحقق فقط — الأكواد نفسها لا تظهر في هذا الجدول أبدًا." /></div>{loading ? <div className="px-4 pb-5 sm:px-5"><LoadingRows count={5} /></div> : codes.length === 0 ? <EmptyState icon={FileKey2} title="لا توجد أكواد بعد" description="أنشئ كودًا عندما يحتاج مدير آخر إلى دخول مؤقت للوحة التحكم." action={<button type="button" className="btn-secondary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> إنشاء أول كود</button>} /> : <CodeTable codes={codes} canDelete={admin.role === 'super_admin'} onToggle={toggleCode} onRevoke={(code) => setConfirming({ action: 'revoke', code })} onDelete={(code) => setConfirming({ action: 'delete', code })} />}</section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.045] px-4 py-3 text-xs leading-5 text-cyan-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p><strong className="font-semibold">ملاحظة أمنية:</strong> الأكواد بتتشفّر داخل المتصفح قبل الحفظ، والتحقق منها بيتم على الخادم. المتصفح بيحتفظ بالكود الجديد مؤقتًا فقط عشان تنسخه.</p></div>
    <CreateCodeDialog open={showCreate} admin={admin} onClose={() => setShowCreate(false)} onCreated={(created) => { setShowCreate(false); setRevealed({ code: created.plainCode, id: created.record.id }); setCodes((current) => [created.record, ...current]); success('تم إنشاء كود الإدارة. انسخه الآن؛ لن يظهر مرة أخرى.'); }} onError={error} />
    <ConfirmDialog open={confirming !== null} title={confirming?.action === 'delete' ? 'حذف هذا الكود؟' : 'إلغاء هذا الكود؟'} message={confirming?.action === 'delete' ? 'سيتم حذف الكود نهائيًا من نظام التحكم. الإجراء ده لا يمكن التراجع عنه.' : 'الكود هيتوقف عن العمل فورًا، حتى لو لسه ما انتهى.'} confirmLabel={confirming?.action === 'delete' ? 'حذف الكود' : 'إلغاء الكود'} danger onConfirm={() => { void confirmAction() }} onCancel={() => setConfirming(null)} />
  </>
}

function CodeTable({ codes, canDelete, onToggle, onRevoke, onDelete }: { codes: AdminCodeSummary[]; canDelete: boolean; onToggle: (code: AdminCodeSummary) => void; onRevoke: (code: AdminCodeSummary) => void; onDelete: (code: AdminCodeSummary) => void }) {
  return <div className="table-wrap rounded-t-none border-x-0 border-b-0"><table className="data-table"><thead><tr><th>الكود</th><th>الدور</th><th>الحالة</th><th>تاريخ الانتهاء</th><th>الاستخدام</th><th className="text-left">الإجراءات</th></tr></thead><tbody className="divide-y divide-white/[.06]">{codes.map((code) => <CodeRow key={code.id} code={code} canDelete={canDelete} onToggle={onToggle} onRevoke={onRevoke} onDelete={onDelete} />)}</tbody></table></div>
}

function CodeRow({ code, canDelete, onToggle, onRevoke, onDelete }: { code: AdminCodeSummary; canDelete: boolean; onToggle: (code: AdminCodeSummary) => void; onRevoke: (code: AdminCodeSummary) => void; onDelete: (code: AdminCodeSummary) => void }) {
  const status = adminCodeStatus(code)
  const statusTone = status === 'active' ? 'success' : status === 'expired' || status === 'exhausted' ? 'warning' : status === 'revoked' ? 'danger' : 'neutral'
  return <tr><td><span className="ltr-island mono text-xs text-slate-400">MS-••••-••••</span><p className="mt-1 text-[10px] text-slate-600">أُنشئ {relativeTimeArabic(code.created_at)}</p></td><td><span className="text-xs font-semibold text-slate-300">{roleLabel(code.role)}</span></td><td><StatusBadge label={ADMIN_CODE_STATUS_LABELS_AR[status] ?? status} tone={statusTone} /></td><td className="whitespace-nowrap text-xs">{code.expires_at ? formatDateTimeArabic(code.expires_at) : 'بدون انتهاء'}</td><td className="mono whitespace-nowrap text-xs">{code.uses_count} / {code.max_uses}</td><td><div className="flex justify-start gap-1.5"><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-white/[.06] hover:text-slate-200" onClick={() => onToggle(code)} disabled={status === 'expired' || status === 'revoked' || status === 'exhausted'} aria-label={code.active ? 'إيقاف الكود' : 'تفعيل الكود'} title={code.active ? 'إيقاف' : 'تفعيل'}><Check className={`h-4 w-4 ${code.active ? 'text-emerald-300' : ''}`} /></button><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200" onClick={() => onRevoke(code)} disabled={status === 'revoked'} aria-label="إلغاء الكود" title="إلغاء"><X className="h-4 w-4" /></button>{canDelete && <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200" onClick={() => onDelete(code)} aria-label="حذف الكود" title="حذف"><Trash2 className="h-4 w-4" /></button>}</div></td></tr>
}

function OneTimeCode({ code, onClose, onCopied }: { code: string; onClose: () => void; onCopied: () => void }) {
  async function copy() {
    try { await navigator.clipboard.writeText(code); onCopied() } catch { /* Clipboard permission is optional. */ }
  }
  return <div className="mb-5 rounded-2xl border border-emerald-300/25 bg-emerald-300/[.07] p-4 shadow-[0_0_34px_rgba(70,227,161,.08)] sm:p-5"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200"><Clipboard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-emerald-100">الكود الجديد جاهز</p><button type="button" onClick={onClose} className="rounded-lg p-1 text-emerald-200/60 hover:text-emerald-100" aria-label="إغلاق إشعار الكود"><X className="h-4 w-4" /></button></div><p className="mt-1 text-xs leading-5 text-emerald-100/65">انسخ الكود الآن. لأسباب أمنية، هيختفي بمجرد إغلاق هذا الإشعار.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><code className="ltr-island mono flex min-h-11 flex-1 items-center rounded-xl border border-emerald-300/20 bg-black/20 px-3 text-sm tracking-[.16em] text-emerald-100">{code}</code><button type="button" className="btn-primary shrink-0" onClick={() => { void copy() }}><Copy className="h-4 w-4" /> نسخ الكود</button></div></div></div></div>
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
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'CREATE_ADMIN_CODE', { code_id: created.record.id, role, expires_at: expiresAt, max_uses: maxUses })
      } catch (cause) {
        auditError = adminErrorMessage(cause, 'تم إنشاء الكود، لكن تعذر تسجيل الحدث في سجل النشاط.')
      }
      onCreated(created)
      if (auditError) onError(auditError)
    } catch (cause) {
      onError(adminErrorMessage(cause, 'تعذر إنشاء كود الإدارة. تأكد أن تاريخ الانتهاء المخصص في المستقبل.'))
    } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><form role="dialog" aria-modal="true" aria-labelledby="create-code-title" onSubmit={(event) => { void submit(event) }} className="panel w-full max-w-lg"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">أكواد الإدارة</p><h2 id="create-code-title" className="mt-1 text-lg font-semibold text-slate-100">إنشاء كود إدارة</h2></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:text-slate-200" aria-label="إغلاق نافذة إنشاء الكود"><X className="h-5 w-5" /></button></div><p className="mt-3 text-xs leading-5 text-slate-500">الكود بيتولد محليًا بطريقة عشوائية آمنة، بيتشفّر، وبعدين بيتحفظ. بيظهر فقط بعد نجاح الإنشاء.</p><div className="mt-5 space-y-4"><div><label htmlFor="code-role" className="field-label">الدور</label><select id="code-role" className="select" value={role} onChange={(event) => setRole(event.target.value as AdminRole)}><option value="operator">المشغّل</option><option value="admin">المدير</option>{admin.role === 'super_admin' && <option value="super_admin">المدير الرئيسي</option>}</select></div><div><label htmlFor="code-expiry" className="field-label">تاريخ الانتهاء</label><select id="code-expiry" className="select" value={expiry} onChange={(event) => setExpiry(event.target.value as CodeExpiryPreset)}>{EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>{expiry === 'custom' && <div><label htmlFor="custom-expiry" className="field-label">تاريخ انتهاء مخصص</label><input id="custom-expiry" className="input" dir="ltr" type="datetime-local" value={customExpiry} onChange={(event) => setCustomExpiry(event.target.value)} /></div>}<div><label htmlFor="max-uses" className="field-label">الحد الأقصى للاستخدام</label><input id="max-uses" className="input mono" dir="ltr" type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></div></div><div className="mt-6 flex justify-end gap-2 border-t border-white/[.07] pt-5"><button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button><SaveButton saving={saving}>إنشاء الكود</SaveButton></div></form></div>
}

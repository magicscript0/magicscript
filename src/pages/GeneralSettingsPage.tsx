import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Settings2, Sparkles } from 'lucide-react'
import { InlineError, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveGeneralSettings } from '../services/control'
import { adminErrorMessage } from '../i18n/dashboard'
import { useToast } from '../components/ToastProvider'
import type { AdminProfile, GeneralSettings } from '../types/supabase'

export function GeneralSettingsPage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available, error: settingsError } = useSharedControlSettings()
  const { success, error } = useToast()
  const [form, setForm] = useState<GeneralSettings>(settings.general)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(settings.general), [settings.general])

  function changeSetting<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveGeneralSettings(form, admin.id)
      setSettings((current) => ({ ...current, general: form }))
      document.title = form.browserTitle || 'MAGIC SCRIPT — لوحة التحكم'
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'UPDATE_SETTINGS', { maintenance_mode: form.maintenanceMode, announcement_configured: Boolean(form.announcement.trim()) })
      } catch (cause) {
        auditError = adminErrorMessage(cause, 'تم حفظ التغييرات، لكن تعذر تسجيل الحدث في سجل النشاط.')
      }
      success('تم حفظ الإعدادات العامة.')
      if (auditError) error(auditError)
    } catch (cause) {
      error(adminErrorMessage(cause, 'تعذر حفظ الإعدادات العامة. حاول مرة أخرى.'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="الإعدادات / الإعدادات العامة" title="الإعدادات العامة" description="من هنا بتتحكم في اسم الموقع وعنوان المتصفح والوصف والإعلان الاختياري ووضع الصيانة." />
    {!available && <div className="mb-5"><InlineError message={settingsError ?? 'بيانات التحكم غير متاحة حاليًا.'} /></div>}
    <form className="panel max-w-4xl" onSubmit={handleSubmit}>
      <PanelHeading icon={Settings2} title="هوية الموقع" description="قيم عرض فقط — لا تؤثر على عقد جسر اللعبة." />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="site-name" label="اسم الموقع" value={form.siteName} onChange={(value) => changeSetting('siteName', value)} maxLength={80} />
        <TextField id="browser-title" label="عنوان المتصفح" value={form.browserTitle} onChange={(value) => changeSetting('browserTitle', value)} maxLength={120} />
        <div className="sm:col-span-2"><label htmlFor="site-description" className="field-label">وصف الموقع</label><textarea id="site-description" className="textarea" value={form.siteDescription} onChange={(event) => changeSetting('siteDescription', event.target.value)} maxLength={180} /></div>
        <div className="sm:col-span-2"><label htmlFor="announcement" className="field-label flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-cyan-300" />إعلان <span className="font-normal text-slate-600">اختياري</span></label><textarea id="announcement" className="textarea" value={form.announcement} onChange={(event) => changeSetting('announcement', event.target.value)} maxLength={240} placeholder="اكتب تحديثًا تشغيليًا قصيرًا يظهر لفريق الإدارة…" /></div>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-4"><input type="checkbox" checked={form.maintenanceMode} onChange={(event) => changeSetting('maintenanceMode', event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-300" /><span><span className="flex items-center gap-2 text-sm font-semibold text-slate-200"><AlertTriangle className="h-4 w-4 text-amber-300" />وضع الصيانة</span><span className="mt-1 block text-xs leading-5 text-slate-500">بيظهر الموقع للزوار كأنه في صيانة. أدوات التحكم بتفضل شغالة حسب سياسة النشر عندك.</span></span></label>
      <div className="mt-6 flex flex-col-reverse gap-4 border-t border-white/[.07] pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />بيتم حفظ التغييرات في نظام التحكم</div><SaveButton saving={saving} /></div>
      <div className="mt-4 flex items-center gap-2 text-xs"><span className="text-slate-600">الوضع الحالي:</span><StatusBadge label={form.maintenanceMode ? 'صيانة' : 'يعمل بشكل طبيعي'} tone={form.maintenanceMode ? 'warning' : 'success'} /></div>
    </form>
  </>
}

function TextField({ id, label, value, onChange, maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return <div><label htmlFor={id} className="field-label">{label}</label><input id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} /></div>
}

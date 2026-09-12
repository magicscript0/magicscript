import { useEffect, useState } from 'react'
import { Clock3, Info, SlidersHorizontal, Users } from 'lucide-react'
import { InlineError, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveDisplaySettings } from '../services/control'
import { adminErrorMessage } from '../i18n/dashboard'
import { useToast } from '../components/ToastProvider'
import { useConfiguredOnlineUsers } from '../hooks/useConfiguredOnlineUsers'
import { useLocalClock } from '../hooks/useLocalClock'
import { formatLocalDateTime } from '../utils/localClock'
import type { AdminProfile, DisplaySettings, LocalClockMode } from '../types/supabase'

export function DisplaySettingsPage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available, error: settingsError } = useSharedControlSettings()
  const { success, error } = useToast()
  const [form, setForm] = useState<DisplaySettings>(settings.display)
  const [saving, setSaving] = useState(false)
  const preview = useConfiguredOnlineUsers(form)
  const previewClock = useLocalClock()

  useEffect(() => setForm(settings.display), [settings.display])

  function changeSetting<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveDisplaySettings(form, admin.id)
      setSettings((current) => ({ ...current, display: form }))
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'UPDATE_ONLINE_SETTINGS', { enabled: form.onlineCountEnabled, mode: form.onlineCountMode, min: form.onlineCountMin, max: form.onlineCountMax, local_time_enabled: form.localTimeEnabled, local_time_clock: form.localTimeClock })
      } catch (cause) {
        auditError = adminErrorMessage(cause, 'تم حفظ إعدادات العرض، لكن تعذر تسجيل الحدث في سجل النشاط.')
      }
      success('تم حفظ إعدادات المتصلين والوقت.')
      if (auditError) error(auditError)
    } catch (cause) {
      error(adminErrorMessage(cause, 'تعذر حفظ إعدادات العرض. حاول مرة أخرى.'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="لوحة التحكم / المتصلون والوقت" title="المتصلون والوقت" description="من هنا بتتحكم في مؤشري أعلى شاشة اللعبة: عدد المتصلين الظاهر، والتاريخ والوقت المحلي للزائر." />
    {!available && <div className="mb-5"><InlineError message={settingsError ?? 'بيانات التحكم غير متاحة حاليًا.'} /></div>}
    <div className="grid gap-5 xl:grid-cols-2">
      <form className="panel" onSubmit={handleSubmit}>
        <PanelHeading icon={SlidersHorizontal} title="عدد المتصلين الظاهر" description="دي قيمة عرض فقط للزوار — مش إحصاءات حقيقية لحركة الدخول." />
        <div className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[.08] bg-white/[.025] p-4"><span><span className="block text-sm font-semibold text-slate-200">إظهار عدد المتصلين</span><span className="mt-1 block text-xs text-slate-500">عند الإيقاف بيختفي العدد من كل الشاشات.</span></span><input type="checkbox" checked={form.onlineCountEnabled} onChange={(event) => changeSetting('onlineCountEnabled', event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><NumberField id="online-min" label="الحد الأدنى" value={form.onlineCountMin} onChange={(value) => changeSetting('onlineCountMin', value)} min={0} /><NumberField id="online-max" label="الحد الأقصى" value={form.onlineCountMax} onChange={(value) => changeSetting('onlineCountMax', value)} min={0} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="online-mode" className="field-label">طريقة العرض</label><select id="online-mode" className="select" value={form.onlineCountMode} onChange={(event) => changeSetting('onlineCountMode', event.target.value as DisplaySettings['onlineCountMode'])}><option value="random">قيمة متغيرة بين الحدين</option><option value="fixed">قيمة ثابتة</option></select></div><NumberField id="online-refresh" label="فاصل التحديث (مللي ثانية)" value={form.onlineCountRefreshMs} onChange={(value) => changeSetting('onlineCountRefreshMs', value)} min={1000} step={500} /></div>
          {form.onlineCountMode === 'fixed' && <NumberField id="online-fixed" label="القيمة الثابتة" value={form.onlineCountFixed ?? form.onlineCountMin} onChange={(value) => changeSetting('onlineCountFixed', value)} min={0} />}

          <div className="mt-2 border-t border-white/[.07] pt-5">
            <PanelHeading icon={Clock3} title="التاريخ والوقت" description="بيظهر بالتوقيت المحلي لكل زائر، وبيتحدث مرة كل دقيقة." />
            <div className="space-y-5">
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[.08] bg-white/[.025] p-4"><span><span className="block text-sm font-semibold text-slate-200">إظهار الوقت</span><span className="mt-1 block text-xs text-slate-500">بيستخدم توقيت جهاز كل زائر — مش توقيت خادم ثابت.</span></span><input type="checkbox" checked={form.localTimeEnabled} onChange={(event) => changeSetting('localTimeEnabled', event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
              <div><label htmlFor="local-time-clock" className="field-label">نظام العرض</label><select id="local-time-clock" className="select" value={form.localTimeClock} onChange={(event) => changeSetting('localTimeClock', event.target.value as LocalClockMode)}><option value="12h">12 ساعة (08:42 مساءً)</option><option value="24h">24 ساعة (20:42)</option></select></div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5"><SaveButton saving={saving} /></div>
      </form>
      <section className="panel">
        <PanelHeading icon={Users} title="معاينة مباشرة" description="شكل المؤشرات بالقيم الموجودة في النموذج الآن." />
        <div className="rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[.08] to-cyan-300/[.03] p-5"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><span className="status-dot animate-pulse-soft bg-emerald-300" />عدد المتصلين الظاهر</div><p className="mono mt-4 text-4xl font-semibold tracking-[-.05em] text-slate-100" dir="ltr">{form.onlineCountEnabled ? (preview ?? '—').toLocaleString('en-US') : 'مخفي'}</p><p className="mt-2 text-xs text-slate-500">{form.onlineCountMode === 'random' ? `قيمة متغيرة بين ${form.onlineCountMin} و ${form.onlineCountMax}` : 'قيمة ثابتة للعرض'}</p></div>
        <div className="mt-4 rounded-2xl border border-white/[.08] bg-black/20 p-5"><div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Clock3 className="h-3.5 w-3.5 text-cyan-300" />التاريخ والوقت المحلي</div><p className="mono mt-4 text-lg font-semibold text-slate-100" dir="ltr">{form.localTimeEnabled ? formatLocalDateTime(previewClock, form.localTimeClock) : 'مخفي'}</p><p className="mt-2 text-xs text-slate-500">{form.localTimeClock === '12h' ? 'نظام 12 ساعة · حسب توقيت الزائر' : 'نظام 24 ساعة · حسب توقيت الزائر'}</p></div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-3.5 py-3 text-xs leading-5 text-cyan-100"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />عدد المتصلين هنا للعرض فقط — لا ينشئ تتبعًا للحضور ولا يدّعي وجود مستخدمين موثقين.</div>
        <div className="mt-5 flex items-center justify-between border-t border-white/[.07] pt-4"><span className="text-xs text-slate-500">الحالة الحالية</span><StatusBadge label={form.onlineCountEnabled || form.localTimeEnabled ? 'ظاهر للزوار' : 'مخفي'} tone={form.onlineCountEnabled || form.localTimeEnabled ? 'success' : 'neutral'} /></div>
        <p className="mt-4 text-[11px] leading-5 text-slate-600">التعديلات بتظهر للزوار فور الضغط على «حفظ التغييرات».</p>
      </section>
    </div>
  </>
}

function NumberField({ id, label, value, onChange, min, step = 1 }: { id: string; label: string; value: number; onChange: (value: number) => void; min: number; step?: number }) {
  return <div><label htmlFor={id} className="field-label">{label}</label><input id={id} className="input mono" type="number" dir="ltr" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>
}

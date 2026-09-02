import { useEffect, useState } from 'react'
import { Info, SlidersHorizontal, Users } from 'lucide-react'
import { InlineError, PageHeader, PanelHeading, SaveButton, StatusBadge } from '../components/AdminPrimitives'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveDisplaySettings } from '../services/control'
import { friendlyControlError } from '../services/supabase'
import { useToast } from '../components/ToastProvider'
import { useConfiguredOnlineUsers } from '../hooks/useConfiguredOnlineUsers'
import type { AdminProfile, DisplaySettings } from '../types/supabase'

export function DisplaySettingsPage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available, error: settingsError } = useSharedControlSettings()
  const { success, error } = useToast()
  const [form, setForm] = useState<DisplaySettings>(settings.display)
  const [saving, setSaving] = useState(false)
  const preview = useConfiguredOnlineUsers(form)

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
        await recordActivity(admin.id, 'UPDATE_ONLINE_SETTINGS', { enabled: form.onlineCountEnabled, mode: form.onlineCountMode, min: form.onlineCountMin, max: form.onlineCountMax })
      } catch (cause) {
        auditError = friendlyControlError(cause, 'The display settings were saved, but the audit event could not be recorded.')
      }
      success('Online display settings saved.')
      if (auditError) error(`Display settings saved, but audit logging failed: ${auditError}`)
    } catch (cause) {
      error(friendlyControlError(cause, 'Display settings could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="Configuration / display" title="Display settings" description="Configure the online display value used by the site interface. It is a presentation value, not verified traffic analytics." />
    {!available && <div className="mb-5"><InlineError message={settingsError ?? 'Supabase control data is unavailable.'} /></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.62fr)]">
      <form className="panel" onSubmit={handleSubmit}>
        <PanelHeading icon={SlidersHorizontal} title="Online display" description="Set the range, mode, and refresh cadence for the value shown in the navigation." />
        <div className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[.08] bg-white/[.025] p-4"><span><span className="block text-sm font-semibold text-slate-200">Show online display</span><span className="mt-1 block text-xs text-slate-500">Hide the value everywhere when disabled.</span></span><input type="checkbox" checked={form.onlineCountEnabled} onChange={(event) => changeSetting('onlineCountEnabled', event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><NumberField id="online-min" label="Minimum" value={form.onlineCountMin} onChange={(value) => changeSetting('onlineCountMin', value)} min={0} /><NumberField id="online-max" label="Maximum" value={form.onlineCountMax} onChange={(value) => changeSetting('onlineCountMax', value)} min={0} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="online-mode" className="field-label">Mode</label><select id="online-mode" className="select" value={form.onlineCountMode} onChange={(event) => changeSetting('onlineCountMode', event.target.value as DisplaySettings['onlineCountMode'])}><option value="random">Random in range</option><option value="fixed">Fixed value</option></select></div><NumberField id="online-refresh" label="Refresh interval (ms)" value={form.onlineCountRefreshMs} onChange={(value) => changeSetting('onlineCountRefreshMs', value)} min={1000} step={500} /></div>
          {form.onlineCountMode === 'fixed' && <NumberField id="online-fixed" label="Fixed value" value={form.onlineCountFixed ?? form.onlineCountMin} onChange={(value) => changeSetting('onlineCountFixed', value)} min={0} />}
        </div>
        <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5"><SaveButton saving={saving}>Save display</SaveButton></div>
      </form>
      <section className="panel">
        <PanelHeading icon={Users} title="Display preview" description="Live preview using the values currently in this form." />
        <div className="rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[.08] to-cyan-300/[.03] p-5"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><span className="status-dot animate-pulse-soft bg-emerald-300" />Online display</div><p className="mono mt-4 text-4xl font-semibold tracking-[-.05em] text-slate-100">{form.onlineCountEnabled ? (preview ?? '—').toLocaleString() : 'Hidden'}</p><p className="mt-2 text-xs text-slate-500">{form.onlineCountMode === 'random' ? `${form.onlineCountMin} – ${form.onlineCountMax} range` : 'Fixed presentation value'}</p></div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-3.5 py-3 text-xs leading-5 text-cyan-100"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />This setting changes a UI display only. It does not create presence tracking or claim verified users.</div>
        <div className="mt-5 flex items-center justify-between border-t border-white/[.07] pt-4"><span className="text-xs text-slate-500">Current state</span><StatusBadge label={form.onlineCountEnabled ? 'Visible' : 'Hidden'} tone={form.onlineCountEnabled ? 'success' : 'neutral'} /></div>
      </section>
    </div>
  </>
}

function NumberField({ id, label, value, onChange, min, step = 1 }: { id: string; label: string; value: number; onChange: (value: number) => void; min: number; step?: number }) {
  return <div><label htmlFor={id} className="field-label">{label}</label><input id={id} className="input mono" type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>
}

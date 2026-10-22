import { useEffect, useState } from 'react'
import { ArrowUpRight, Eye, Sparkles } from 'lucide-react'
import { InlineError, PageHeader, PanelHeading, SaveButton } from '../components/AdminPrimitives'
import { GameBrandLockup } from '../components/GameBrand'
import { GameSocialLinks } from '../components/GameSocialLinks'
import { PublicGameHud } from '../components/PublicGameHud'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveLoginSettings } from '../services/control'
import { friendlyControlError } from '../services/supabase'
import { useToast } from '../components/ToastProvider'
import type { AdminProfile, LoginSettings } from '../types/supabase'

/**
 * PUBLIC GAME — control center for the public login experience.
 *
 * This is the single place where the public title, supporting text, status
 * label and the two upper HUD indicators are managed. Social links and the
 * online/time display ranges keep their own focused pages; the preview here
 * is presentation-only (no Firebase listener, no second authentication flow).
 */
export function PublicGamePage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available, error: settingsError } = useSharedControlSettings()
  const { success, error } = useToast()
  const [form, setForm] = useState<LoginSettings>(settings.login)
  const [saving, setSaving] = useState(false)

  useEffect(() => setForm(settings.login), [settings.login])

  function changeSetting<K extends keyof LoginSettings>(key: K, value: LoginSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveLoginSettings(form, admin.id)
      setSettings((current) => ({ ...current, login: form }))
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'UPDATE_PUBLIC_LOGIN_SETTINGS', {
          title_configured: Boolean(form.title.trim()),
          caption_configured: Boolean(form.caption.trim()),
          status_visible: form.showStatus,
        })
      } catch (cause) {
        auditError = friendlyControlError(cause, 'The login settings were saved, but the audit event could not be recorded.')
      }
      success('Public login settings saved.')
      if (auditError) error(`Login settings saved, but audit logging failed: ${auditError}`)
    } catch (cause) {
      error(friendlyControlError(cause, 'Public login settings could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Public Game / control center"
        title="Public login experience"
        description="Control what players see on the Apple of Fortune login screen — heading, supporting text, status label, and the upper live-activity and local-time indicators."
      />
      {!available && <div className="mb-5"><InlineError message={settingsError ?? 'Supabase control data is unavailable.'} /></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.78fr)]">
        <form className="panel" onSubmit={handleSubmit}>
          <PanelHeading icon={Sparkles} title="Login presentation" description="Presentation-only values stored in Supabase. They never touch Firebase or the access/session layer." />
          <div className="space-y-5">
            <TextField id="login-title" label="Public title" value={form.title} onChange={(value) => changeSetting('title', value)} maxLength={80} hint="The large heading under the brand wordmark." />
            <TextField id="login-caption" label="Supporting text" value={form.caption} onChange={(value) => changeSetting('caption', value)} maxLength={180} hint="The line under the public title." />
            <TextField id="login-status-label" label="Status label" value={form.statusLabel} onChange={(value) => changeSetting('statusLabel', value)} maxLength={60} hint="Shown next to the ready indicator inside the login panel." />
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[.08] bg-white/[.025] p-4">
              <span>
                <span className="block text-sm font-semibold text-slate-200">Show status indicator</span>
                <span className="mt-1 block text-xs text-slate-500">Hide the ready dot + label inside the login panel when disabled.</span>
              </span>
              <input
                type="checkbox"
                checked={form.showStatus}
                onChange={(event) => changeSetting('showStatus', event.target.checked)}
                className="h-5 w-5 accent-emerald-400"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5">
            <SaveButton saving={saving}>Save login</SaveButton>
          </div>
        </form>

        <section className="panel">
          <PanelHeading icon={Eye} title="Live preview" description="Approximately how the public login looks with the current settings." />
          <div className="pg-preview rounded-2xl px-6 py-8">
            <PublicGameHud display={settings.display} />
            <GameBrandLockup title={form.title || 'Apple of Fortune'} caption={form.caption || undefined} />
            <div className="mx-auto mt-6 max-w-[380px] rounded-2xl border border-white/[.08] bg-[#0a1215]/80 px-6 py-5 backdrop-blur">
              <div className="flex items-center gap-2">
                <p className="pg-eyebrow">Session access</p>
                <span className="h-px flex-1 bg-white/[.1]" aria-hidden="true" />
                {form.showStatus && (
                  <span className="pg-panel__state">
                    <span className="pg-dot" aria-hidden="true" />
                    {form.statusLabel || 'Ready'}
                  </span>
                )}
              </div>
              <div className="mt-6 space-y-4">
                <div className="pg-slot"><input className="pg-input mono" placeholder="Account ID" disabled aria-label="Account ID preview" /></div>
                <div className="pg-slot"><input className="pg-input mono uppercase" placeholder="ACCESS CODE" disabled aria-label="Access Code preview" /></div>
              </div>
              <div className="pg-btn pg-btn--primary mt-6 opacity-70"><span>Enter game</span></div>
            </div>
            <div className="mx-auto mt-6 max-w-[380px]"><GameSocialLinks links={settings.social} /></div>
          </div>
          <div className="mt-5 grid gap-2 border-t border-white/[.07] pt-4 text-xs text-slate-500 sm:grid-cols-2">
            <a href="#/display" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] px-3 py-2.5 text-slate-300 transition hover:border-emerald-300/30 hover:text-emerald-200">
              Online &amp; time display <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a href="#/social" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] px-3 py-2.5 text-slate-300 transition hover:border-emerald-300/30 hover:text-emerald-200">
              Social links <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
      </div>
    </>
  )
}

function TextField({ id, label, value, onChange, maxLength, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength: number; hint: string }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} />
      <p className="mt-1.5 text-[11px] text-slate-600">{hint}</p>
    </div>
  )
}

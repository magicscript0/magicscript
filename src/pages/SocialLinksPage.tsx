import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Send, Youtube } from 'lucide-react'
import { PageHeader, PanelHeading, SaveButton, InlineError } from '../components/AdminPrimitives'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveSocialLinks } from '../services/control'
import { useToast } from '../components/ToastProvider'
import type { AdminProfile } from '../types/supabase'

export function SocialLinksPage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available } = useSharedControlSettings()
  const { success, error } = useToast()
  const [telegramUrl, setTelegramUrl] = useState(settings.social.telegramUrl)
  const [youtubeUrl, setYoutubeUrl] = useState(settings.social.youtubeUrl)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTelegramUrl(settings.social.telegramUrl)
    setYoutubeUrl(settings.social.youtubeUrl)
  }, [settings.social.telegramUrl, settings.social.youtubeUrl])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const social = { telegramUrl, youtubeUrl }
      await saveSocialLinks(social, admin.id)
      setSettings((current) => ({ ...current, social }))
      await recordActivity(admin.id, 'UPDATE_SOCIAL_LINKS', { telegram_configured: Boolean(telegramUrl.trim()), youtube_configured: Boolean(youtubeUrl.trim()) }).catch(() => undefined)
      success('Social links updated across the site.')
    } catch (cause) {
      error(cause instanceof Error ? cause.message : 'Social links could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="Configuration / public surface" title="Social links" description="Control the links displayed in the workspace footer and public-facing surfaces. Empty links stay hidden." />
    {!available && <div className="mb-5"><InlineError message="Control system temporarily unavailable. Changes will be enabled when Supabase is configured." /></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.65fr)]">
      <form className="panel" onSubmit={handleSubmit}>
        <PanelHeading icon={Send} title="Channel destinations" description="Use complete http or https URLs. Links open in a new tab." />
        <div className="space-y-5">
          <LinkField id="telegram-url" label="Telegram" icon={Send} value={telegramUrl} onChange={setTelegramUrl} placeholder="https://t.me/your-channel" />
          <LinkField id="youtube-url" label="YouTube" icon={Youtube} value={youtubeUrl} onChange={setYoutubeUrl} placeholder="https://youtube.com/@your-channel" />
        </div>
        <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5"><SaveButton saving={saving}>Save links</SaveButton></div>
      </form>
      <section className="panel">
        <PanelHeading icon={CheckCircle2} title="Live preview" description="The site only renders a button when a valid URL is configured." />
        <div className="rounded-xl border border-white/[.07] bg-black/15 p-4">
          <p className="eyebrow">Workspace footer</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {telegramUrl.trim() && <PreviewLink icon={Send} label="Telegram" />}
            {youtubeUrl.trim() && <PreviewLink icon={Youtube} label="YouTube" />}
            {!telegramUrl.trim() && !youtubeUrl.trim() && <p className="text-xs text-slate-600">No links configured</p>}
          </div>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">The seeded Telegram destination is managed from Supabase. Add or replace it here to publish the value through the control plane.</p>
      </section>
    </div>
  </>
}

function LinkField({ id, label, icon: Icon, value, onChange, placeholder }: { id: string; label: string; icon: typeof Send; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label htmlFor={id} className="field-label flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-emerald-300" />{label} URL</label><div className="relative"><input id={id} className="input pr-10" type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />{value.trim() && <a href={value} target="_blank" rel="noreferrer" aria-label={`Open ${label} link`} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-emerald-300"><ExternalLink className="h-4 w-4" /></a>}</div></div>
}

function PreviewLink({ icon: Icon, label }: { icon: typeof Send; label: string }) {
  return <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/[.08] px-3 text-xs font-semibold text-emerald-200"><Icon className="h-3.5 w-3.5" />{label}</span>
}

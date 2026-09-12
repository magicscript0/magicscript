import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Send, Youtube } from 'lucide-react'
import { PageHeader, PanelHeading, SaveButton, InlineError } from '../components/AdminPrimitives'
import { useSharedControlSettings } from '../layouts/AdminLayout'
import { recordActivity } from '../services/activity'
import { saveSocialLinks } from '../services/control'
import { adminErrorMessage } from '../i18n/dashboard'
import { useToast } from '../components/ToastProvider'
import type { AdminProfile } from '../types/supabase'

export function SocialLinksPage({ admin }: { admin: AdminProfile }) {
  const { settings, setSettings, available, error: settingsError } = useSharedControlSettings()
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
      let auditError: string | null = null
      try {
        await recordActivity(admin.id, 'UPDATE_SOCIAL_LINKS', { telegram_configured: Boolean(telegramUrl.trim()), youtube_configured: Boolean(youtubeUrl.trim()) })
      } catch (cause) {
        auditError = adminErrorMessage(cause, 'تم حفظ الروابط، لكن تعذر تسجيل الحدث في سجل النشاط.')
      }
      success('تم تحديث روابط التواصل في كل أنحاء الموقع.')
      if (auditError) error(auditError)
    } catch (cause) {
      error(adminErrorMessage(cause, 'تعذر حفظ روابط التواصل. حاول مرة أخرى.'))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="الإعدادات / روابط التواصل" title="روابط التواصل" description="من هنا بتتحكم في روابط التواصل اللي بتظهر للزوار في الموقع. الروابط الفارغة بتفضل مخفية." />
    {!available && <div className="mb-5"><InlineError message={settingsError ?? 'بيانات التحكم غير متاحة حاليًا.'} /></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.65fr)]">
      <form className="panel" onSubmit={handleSubmit}>
        <PanelHeading icon={Send} title="الروابط" description="اكتب الرابط كاملًا يبدأ بـ http أو https. الروابط بتفتح في نافذة جديدة." />
        <div className="space-y-5">
          <LinkField id="telegram-url" label="رابط Telegram" icon={Send} value={telegramUrl} onChange={setTelegramUrl} placeholder="https://t.me/your-channel" />
          <LinkField id="youtube-url" label="رابط YouTube" icon={Youtube} value={youtubeUrl} onChange={setYoutubeUrl} placeholder="https://youtube.com/@your-channel" />
        </div>
        <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5"><SaveButton saving={saving}>حفظ الروابط</SaveButton></div>
      </form>
      <section className="panel">
        <PanelHeading icon={CheckCircle2} title="معاينة مباشرة" description="زر الرابط بيظهر للزائر فقط لما يكون الرابط صالحًا." />
        <div className="rounded-xl border border-white/[.07] bg-black/15 p-4">
          <p className="eyebrow">تذييل الموقع</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {telegramUrl.trim() && <PreviewLink icon={Send} label="Telegram" />}
            {youtubeUrl.trim() && <PreviewLink icon={Youtube} label="YouTube" />}
            {!telegramUrl.trim() && !youtubeUrl.trim() && <p className="text-xs text-slate-600">لا توجد روابط بعد</p>}
          </div>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">الروابط بتتحفظ في نظام التحكم وبتظهر فورًا في كل الأماكن اللي فيها روابط التواصل.</p>
      </section>
    </div>
  </>
}

function LinkField({ id, label, icon: Icon, value, onChange, placeholder }: { id: string; label: string; icon: typeof Send; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label htmlFor={id} className="field-label flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-emerald-300" />{label}</label><div className="relative"><input id={id} className="input pe-10" dir="ltr" type="url" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />{value.trim() && <a href={value} target="_blank" rel="noreferrer" aria-label={`فتح رابط ${label}`} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-emerald-300"><ExternalLink className="h-4 w-4" /></a>}</div></div>
}

function PreviewLink({ icon: Icon, label }: { icon: typeof Send; label: string }) {
  return <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/[.08] px-3 text-xs font-semibold text-emerald-200"><Icon className="h-3.5 w-3.5" />{label}</span>
}

import { Mail, ShieldCheck, UserRound } from 'lucide-react'
import { PageHeader, PanelHeading, StatusBadge } from '../components/AdminPrimitives'
import { roleDescription, roleLabel } from '../utils/permissions'
import type { AdminProfile } from '../types/supabase'

export function ProfilePage({ admin }: { admin: AdminProfile }) {
  const displayName = admin.username || admin.email.split('@')[0]
  return <>
    <PageHeader eyebrow="الإعدادات / حسابي" title="حسابي" description="حسابك بيتدار من خلال نظام المصادقة وقائمة المديرين." />
    <div className="grid max-w-4xl gap-5 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <section className="panel">
        <PanelHeading icon={UserRound} title="بيانات الحساب" />
        <div className="flex items-center gap-4 rounded-xl border border-white/[.07] bg-white/[.025] p-4"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300/80 to-emerald-300/80 text-sm font-extrabold text-[#052119]">{displayName.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{displayName}</p><p className="ltr-island mt-1 truncate text-xs text-slate-500">{admin.email}</p></div></div>
        <dl className="mt-5 space-y-4 text-sm"><ProfileRow icon={Mail} label="البريد الإلكتروني" value={admin.email} /><ProfileRow icon={UserRound} label="اسم المستخدم" value={admin.username || 'غير محدد'} /><ProfileRow icon={ShieldCheck} label="حالة الحساب" value={admin.active ? 'نشط' : 'غير نشط'} /></dl>
      </section>
      <section className="panel">
        <PanelHeading icon={ShieldCheck} title="مستوى الصلاحية" description="الصلاحيات مفروضة في الواجهة ومرة أخرى من قواعد قاعدة البيانات نفسها." />
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.05] p-5"><StatusBadge label={roleLabel(admin.role)} tone="success" /><p className="mt-4 text-sm font-semibold text-slate-200">{roleDescription(admin.role)}</p><p className="mt-2 text-xs leading-5 text-slate-500">دورك هو اللي بيحدد أقسام التنقل والإجراءات المتاحة لك. لا تشارك كلمة مرور حسابك أبدًا.</p></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2"><AccessItem label="وحدة التحكم باللعبة" enabled /><AccessItem label="سجل الجولات" enabled /><AccessItem label="الإعدادات" enabled={admin.role !== 'operator'} /><AccessItem label="أكواد الإدارة" enabled={admin.role !== 'operator'} /></div>
      </section>
    </div>
  </>
}

function ProfileRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) { return <div className="flex items-center gap-3"><Icon className="h-4 w-4 text-slate-600" /><dt className="w-28 shrink-0 text-xs text-slate-500">{label}</dt><dd className="truncate text-xs font-medium text-slate-300">{value}</dd></div> }
function AccessItem({ label, enabled }: { label: string; enabled: boolean }) { return <div className="flex items-center justify-between rounded-lg border border-white/[.07] px-3 py-2.5"><span className="text-xs text-slate-400">{label}</span><span className={`status-dot ${enabled ? 'bg-emerald-300' : 'bg-slate-700'}`} /></div> }

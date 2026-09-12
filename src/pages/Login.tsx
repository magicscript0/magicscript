import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { isSupabaseConfigured } from '../config/supabase'
import { adminErrorMessage } from '../i18n/dashboard'
import type { AdminProfile } from '../types/supabase'

export interface LoginProps {
  /** Supabase Auth email/password path used by the production application. */
  onAuthenticate: (email: string, password: string) => Promise<AdminProfile>
  /** Status from the session bootstrap check, such as missing configuration or revoked access. */
  statusMessage?: string | null
}

const INPUT_CLASSES = 'input h-12 pe-11 ps-11'

export function Login({ onAuthenticate, statusMessage }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'MAGIC SCRIPT · تسجيل الدخول'
  }, [])

  useEffect(() => {
    if (statusMessage) setError(statusMessage)
  }, [statusMessage])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return
    setError(null)

    const normalizedEmail = email.trim()
    if (normalizedEmail.length === 0) {
      setError('أدخل البريد الإلكتروني للعمل.')
      return
    }
    if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('أدخل بريدًا إلكترونيًا صحيحًا.')
      return
    }
    if (password.length === 0) {
      setError('أدخل كلمة المرور.')
      return
    }

    setChecking(true)
    void onAuthenticate(normalizedEmail, password)
      .catch((cause: unknown) => {
        setChecking(false)
        setError(adminErrorMessage(cause, 'تعذر إتمام عملية تسجيل الدخول. حاول مرة أخرى.'))
      })
  }

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(70,227,161,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(70,227,161,.06) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'linear-gradient(to bottom, black, transparent 78%)' }} />
    <div className="relative w-full max-w-[420px] page-enter">
      <div className="mb-7 flex flex-col items-center text-center"><BrandMark /><p className="brand-latin mt-5 text-[11px] font-bold uppercase tracking-[.28em] text-emerald-300/80">MAGIC SCRIPT</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] text-slate-100">أهلًا بعودتك.</h1><p className="mt-2 text-sm text-slate-500">سجّل الدخول إلى مساحة العمل.</p></div>
      <form onSubmit={handleSubmit} noValidate className="panel p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-3.5 py-3"><ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" /><p className="text-xs leading-5 text-cyan-100/80">الدخول محمي بنظام المصادقة وبدورك الإداري.</p></div>
        <div className="space-y-4">
          <div><label htmlFor="operator-id" className="field-label">البريد الإلكتروني للعمل</label><div className="relative"><Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input id="operator-id" name="email" type="email" autoComplete="username" inputMode="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={checking} className={INPUT_CLASSES} /></div></div>
          <div><label htmlFor="password" className="field-label">كلمة المرور</label><div className="relative"><LockKeyhole className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="أدخل كلمة المرور" value={password} onChange={(event) => setPassword(event.target.value)} disabled={checking} className={INPUT_CLASSES} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} disabled={checking} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-200"><span className="sr-only">{showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}</span>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
        </div>
        {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-3.5 py-3 text-xs leading-5 text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />{error}</div>}
        <button type="submit" disabled={checking} aria-label={checking ? 'جارٍ التحقق' : 'تسجيل الدخول'} className="btn-primary mt-5 min-h-12 w-full text-sm">{checking ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#06251a]/30 border-t-[#06251a]" />جارٍ التحقق…</> : <><KeyRound className="h-4 w-4" />تسجيل الدخول<ArrowLeft className="ms-auto h-4 w-4" /></>}</button>
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">واجهة تشغيل داخلية. لا توجد أي وظيفة أموال حقيقية.</p>
      </form>
      <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-700"><span className={`status-dot ${isSupabaseConfigured() ? 'bg-emerald-300' : 'bg-amber-300'}`} />{isSupabaseConfigured() ? 'نظام التحكم جاهز' : 'نظام التحكم يحتاج إلى إعداد'}</div>
    </div>
  </main>
}

import { LockKeyhole } from 'lucide-react'
import { roleLabel } from '../utils/permissions'
import type { AdminRole } from '../types/supabase'

export function NotAuthorizedPage({ role }: { role: AdminRole }) {
  return <div className="panel mx-auto max-w-xl py-12 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-amber-300" /><h1 className="mt-4 text-lg font-semibold text-slate-100">الدخول مقيّد</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">دورك الحالي ({roleLabel(role)}) لا يتضمن هذا القسم. اطلب من المدير الرئيسي تعديل دورك إذا كنت تحتاج إلى الوصول إليه.</p></div>
}

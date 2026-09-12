import type { AdminRole } from '../types/supabase'

export type Permission =
  | 'dashboard.view'
  | 'game.use'
  | 'history.view'
  | 'codes.manage'
  | 'access.manage'
  | 'logs.view'
  | 'security.view'
  | 'social.manage'
  | 'display.manage'
  | 'general.manage'
  | 'profile.view'

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: [
    'dashboard.view',
    'game.use',
    'history.view',
    'codes.manage',
    'access.manage',
    'logs.view',
    'security.view',
    'social.manage',
    'display.manage',
    'general.manage',
    'profile.view',
  ],
  admin: [
    'dashboard.view',
    'game.use',
    'history.view',
    'codes.manage',
    'access.manage',
    'logs.view',
    'security.view',
    'social.manage',
    'display.manage',
    'general.manage',
    'profile.view',
  ],
  // NOTE: the operator permission set is intentionally unchanged — the
  // monitoring center is restricted to admin roles, matching the RLS bar.
  operator: ['dashboard.view', 'game.use', 'history.view', 'profile.view'],
}

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Arabic presentation of the role — the stored role values never change. */
export function roleLabel(role: AdminRole): string {
  if (role === 'super_admin') return 'المدير الرئيسي'
  if (role === 'admin') return 'المدير'
  return 'المشغّل'
}

export function roleDescription(role: AdminRole): string {
  if (role === 'super_admin') return 'تحكم كامل في كل أقسام مركز التحكم.'
  if (role === 'admin') return 'إدارة الإعدادات التشغيلية وأكواد الدخول.'
  return 'تشغيل وحدة التحكم باللعبة ومتابعة سجل العمليات.'
}

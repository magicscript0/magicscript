import type { AdminRole } from '../types/supabase'

export type Permission =
  | 'dashboard.view'
  | 'game.use'
  | 'history.view'
  | 'codes.manage'
  | 'access.manage'
  | 'logs.view'
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
    'social.manage',
    'display.manage',
    'general.manage',
    'profile.view',
  ],
  operator: ['dashboard.view', 'game.use', 'history.view', 'profile.view'],
}

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function roleLabel(role: AdminRole): string {
  if (role === 'super_admin') return 'SUPER ADMIN'
  if (role === 'admin') return 'ADMIN'
  return 'OPERATOR'
}

export function roleDescription(role: AdminRole): string {
  if (role === 'super_admin') return 'Full control across the command center.'
  if (role === 'admin') return 'Manage operational settings and access codes.'
  return 'Run the game console and review operational history.'
}

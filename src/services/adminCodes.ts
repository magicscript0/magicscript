import { requireClient } from './supabase'
import type { AdminCodeRow, AdminCodeSummary, AdminRole } from '../types/supabase'

export type CodeExpiryPreset = '1h' | '6h' | '12h' | '1d' | '7d' | '30d' | 'custom'

export interface CreateAdminCodeInput {
  role: AdminRole
  expiresAt: string | null
  maxUses: number
}

export interface CreatedAdminCode {
  record: AdminCodeSummary
  plainCode: string
}

export function isAdminCodeExpired(code: Pick<AdminCodeRow, 'expires_at' | 'revoked_at'>, now = Date.now()): boolean {
  return code.revoked_at !== null || (code.expires_at !== null && Date.parse(code.expires_at) <= now)
}

export function isAdminCodeUsable(
  code: Pick<AdminCodeRow, 'active' | 'expires_at' | 'revoked_at' | 'uses_count' | 'max_uses'>,
  now = Date.now(),
): boolean {
  return code.active && !isAdminCodeExpired(code, now) && code.uses_count < code.max_uses
}

export function adminCodeStatus(
  code: Pick<AdminCodeRow, 'active' | 'expires_at' | 'revoked_at' | 'uses_count' | 'max_uses'>,
  now = Date.now(),
): 'active' | 'expired' | 'revoked' | 'exhausted' | 'inactive' {
  if (code.revoked_at !== null) return 'revoked'
  if (code.expires_at !== null && Date.parse(code.expires_at) <= now) return 'expired'
  if (code.uses_count >= code.max_uses) return 'exhausted'
  return code.active ? 'active' : 'inactive'
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure code generation is unavailable in this browser.')
  }
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function generateAdminCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const limit = Math.floor(256 / alphabet.length) * alphabet.length
  let value = ''
  while (value.length < 20) {
    for (const byte of randomBytes(32)) {
      if (byte >= limit) continue
      value += alphabet[byte % alphabet.length]
      if (value.length === 20) break
    }
  }
  return `MS-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`
}

export async function hashAdminCode(code: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure code hashing is unavailable in this browser.')
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function listAdminCodes(): Promise<AdminCodeSummary[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('admin_codes')
    .select('id, role, active, expires_at, max_uses, uses_count, created_at, created_by, revoked_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Admin codes could not be loaded.')
  return data ?? []
}

/** The plaintext code is returned once and never sent to storage or logs. */
export async function createAdminCode(
  input: CreateAdminCodeInput,
  adminId: string,
): Promise<CreatedAdminCode> {
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 1000) {
    throw new Error('Maximum uses must be between 1 and 1,000.')
  }
  const plainCode = generateAdminCode()
  const codeHash = await hashAdminCode(plainCode)
  const client = requireClient()
  const { data, error } = await client
    .from('admin_codes')
    .insert({
      code_hash: codeHash,
      role: input.role,
      expires_at: input.expiresAt,
      max_uses: input.maxUses,
      created_by: adminId,
    })
    .select('id, role, active, expires_at, max_uses, uses_count, created_at, created_by, revoked_at')
    .single()
  if (error || !data) throw new Error('Admin code could not be created.')
  return { record: data, plainCode }
}

export async function setAdminCodeActive(id: string, active: boolean): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('admin_codes').update({ active }).eq('id', id)
  if (error) throw new Error('The admin code status could not be updated.')
}

export async function revokeAdminCode(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client
    .from('admin_codes')
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error('The admin code could not be revoked.')
}

export async function deleteAdminCode(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('admin_codes').delete().eq('id', id)
  if (error) throw new Error('The admin code could not be deleted.')
}

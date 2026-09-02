import { getSupabaseClient, requireClient } from './supabase'
import type { ActivityLogRow, Json } from '../types/supabase'

export interface ActivityLogEntry extends ActivityLogRow {
  actorLabel: string
}

export async function recordActivity(
  adminId: string,
  action: string,
  metadata: Record<string, Json> = {},
): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.from('activity_logs').insert({
    admin_id: adminId,
    action,
    metadata,
  })
  if (error) throw new Error('The activity could not be recorded.')
}

export async function listActivityLogs(limit = 40): Promise<ActivityLogEntry[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('activity_logs')
    .select('id, admin_id, action, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('Activity logs could not be loaded.')
  return (data ?? []).map((entry) => ({ ...entry, actorLabel: entry.admin_id ?? 'System' }))
}

import { getSupabaseClient, requireClient } from './supabase'
import type { Json, RoundHistoryRow, RoundHistorySource, RoundHistoryStatus } from '../types/supabase'

export interface RoundHistoryInput {
  roundIdentifier: string
  source: RoundHistorySource
  status: RoundHistoryStatus
  adminId: string | null
  metadata: Record<string, Json>
}

export async function recordRoundHistory(input: RoundHistoryInput): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  const { error } = await client.from('round_history').insert({
    round_identifier: input.roundIdentifier,
    source: input.source,
    status: input.status,
    created_by: input.adminId,
    metadata: input.metadata,
  })
  if (error) throw new Error('Round history could not be recorded.')
}

export async function listRoundHistory(limit = 50): Promise<RoundHistoryRow[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('round_history')
    .select('id, round_identifier, source, created_by, created_at, status, metadata')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('Round history could not be loaded.')
  return data ?? []
}

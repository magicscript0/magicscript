import { classifySupabaseRequestError, requireClient } from './supabase'
import type { Json, RoundHistoryRow, RoundHistorySource, RoundHistoryStatus } from '../types/supabase'

export interface RoundHistoryInput {
  roundIdentifier: string
  source: RoundHistorySource
  status: RoundHistoryStatus
  adminId: string | null
  metadata: Record<string, Json>
}

export async function recordRoundHistory(input: RoundHistoryInput): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('round_history').insert({
    round_identifier: input.roundIdentifier,
    source: input.source,
    status: input.status,
    created_by: input.adminId,
    metadata: input.metadata,
  })
  if (error) throw classifySupabaseRequestError(error, 'Round history could not be recorded. Check the round_history table and its RLS policy.')
}

export async function listRoundHistory(limit = 50): Promise<RoundHistoryRow[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('round_history')
    .select('id, round_identifier, source, created_by, created_at, status, metadata')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw classifySupabaseRequestError(error, 'Round history could not be loaded. Check the round_history table and its RLS policy.')
  return data ?? []
}

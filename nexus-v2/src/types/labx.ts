export interface LabxLiveGameResponse {
  active: boolean
  session_id?: number
  account_id?: number
  bet_sum?: number
  win_sum?: number
  current_row?: number
  user_picks?: number[]
  total_rows?: number
  cols_per_row?: number
  matrix?: number[][]
  recommended_next?: {
    row: number
    cols: number[]
  }
  message?: string
}

export interface LabxBalanceResponse {
  balance: number
}

export interface LabxSessionRecord {
  id: number
  account_id: number
  game_id: number
  action_step: number
  bet_sum: number
  win_sum: number
  matrix: number[][]
  user_picks: number[]
  status: number // 1: Active, 2: Win/Cashout, 3: Loss/Crash
  created_at: number
  updated_at: number
}

export interface LiveGameState {
  active: boolean
  session_id: number | null
  account_id: number | null
  bet_sum: number | null
  win_sum: number | null
  current_row: number
  user_picks: number[]
  total_rows: number
  cols_per_row: number
  matrix: number[][] | null
  recommended_next: { row: number; cols: number[] } | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export interface BalanceState {
  balance: number | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export interface SessionsState {
  sessions: LabxSessionRecord[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Normalizes user pick value to a 0-based matrix column index (0 to 4).
 * The 1xbet mobile app sends 1-based CE values (1 to 5) which are saved in user_picks.
 */
export function normalizePickColIndex(rawPick: number | null | undefined): number | null {
  if (rawPick === null || rawPick === undefined || typeof rawPick !== 'number') return null
  // If pick is 1..5, normalize to 0..4
  if (rawPick >= 1 && rawPick <= 5) {
    return rawPick - 1
  }
  // If pick was already 0..4
  if (rawPick >= 0 && rawPick < 5) {
    return rawPick
  }
  return null
}


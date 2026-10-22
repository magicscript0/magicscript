/**
 * Single source of truth for the demo game geometry and the /m11 contract.
 * Do NOT duplicate these values (keys, multipliers, curve) anywhere else.
 */

export const GRID_ROWS = 10
export const GRID_COLS = 5
export const CELL_COUNT = GRID_ROWS * GRID_COLS // 50

/** Firebase child keys under /m11, in logical row order (row 1 first). */
export const M_KEYS = [
  'm1', 'm2', 'm3', 'm4', 'm5',
  'm6', 'm7', 'm8', 'm9', 'm10',
  'm11', 'm12', 'm13', 'm14', 'm15',
  'm16', 'm17', 'm18', 'm19', 'm20',
  'm21', 'm22', 'm23', 'm24', 'm25',
  'm26', 'm27', 'm28', 'm29', 'm30',
  'm31', 'm32', 'm33', 'm34', 'm35',
  'm36', 'm37', 'm38', 'm39', 'm40',
  'm41', 'm42', 'm43', 'm44', 'm45',
  'm46', 'm47', 'm48', 'm49', 'm50',
] as const

export interface RowSpec {
  /** 1-based logical row. Row 1 is the bottom (easiest) row. */
  readonly row: number
  /** The 5 firebase keys that belong to this row, left to right. */
  readonly keys: readonly (typeof M_KEYS)[number][]
  /** Payout multiplier displayed for this row. */
  readonly multiplier: number
  /** How many cells in this row are safe ("1") — demo generator curve. */
  readonly safeCells: number
}

/**
 * Row 1 (×1.23, m1–m5) … Row 10 (×349.68, m46–m50).
 * Matches the verified demo-client contract exactly.
 */
export const ROWS: readonly RowSpec[] = [
  { row: 1, multiplier: 1.23, safeCells: 1, keys: ['m1', 'm2', 'm3', 'm4', 'm5'] },
  { row: 2, multiplier: 1.54, safeCells: 1, keys: ['m6', 'm7', 'm8', 'm9', 'm10'] },
  { row: 3, multiplier: 1.93, safeCells: 1, keys: ['m11', 'm12', 'm13', 'm14', 'm15'] },
  { row: 4, multiplier: 2.41, safeCells: 1, keys: ['m16', 'm17', 'm18', 'm19', 'm20'] },
  { row: 5, multiplier: 4.02, safeCells: 2, keys: ['m21', 'm22', 'm23', 'm24', 'm25'] },
  { row: 6, multiplier: 6.71, safeCells: 2, keys: ['m26', 'm27', 'm28', 'm29', 'm30'] },
  { row: 7, multiplier: 11.18, safeCells: 2, keys: ['m31', 'm32', 'm33', 'm34', 'm35'] },
  { row: 8, multiplier: 27.97, safeCells: 3, keys: ['m36', 'm37', 'm38', 'm39', 'm40'] },
  { row: 9, multiplier: 69.93, safeCells: 3, keys: ['m41', 'm42', 'm43', 'm44', 'm45'] },
  { row: 10, multiplier: 349.68, safeCells: 4, keys: ['m46', 'm47', 'm48', 'm49', 'm50'] },
]

/** Demo generator curve for rows 1–10 (parity with the original operator app). */
export const SAFE_CELL_CURVE: readonly number[] = ROWS.map((row) => row.safeCells)

/** UI timings (parity-inspired, demo-only). */
export const START_SIMULATION_MS = 1600
export const REVEAL_ROW_DELAY_MS = 500
export const REVEAL_ROW_DELAY_REDUCED_MOTION_MS = 80

/** Simulated online-users counter — pure UI decoration, no presence system. */
export const ONLINE_USERS = { min: 20, max: 600, refreshMs: 2000 } as const

/** Consistent multiplier formatting across the whole UI. */
export const formatMultiplier = (multiplier: number): string => `×${multiplier.toFixed(2)}`

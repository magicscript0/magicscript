import type { M_KEYS } from '../config/game'

/** A firebase child key under /m11: "m1" … "m50". */
export type MKey = (typeof M_KEYS)[number]

/** The only two values the contract allows — always STRINGS. */
export type M11Value = '0' | '1'

/** Object stored at /m11/mN — its single key equals the child name. */
export type M11Child<K extends MKey = MKey> = { readonly [key in K]: M11Value }

/**
 * Dynamic-access view of a child wrapper — for loops that iterate over the
 * 50 keys (the strongly-typed M11Child union cannot be indexed dynamically).
 */
export type M11ChildRecord = Readonly<Record<string, M11Value>>

/** A complete, validated /m11 node: all 50 children present. */
export type M11Node = { readonly [K in MKey]: M11Child<K> }

/** A single grid cell in the UI view model. */
export interface CellView {
  readonly key: MKey
  readonly value: M11Value
}

/** One logical row (row 1 = bottom … row 10 = top). */
export interface RowView {
  readonly row: number
  readonly multiplier: number
  readonly cells: readonly CellView[]
}

/** A locally generated demo round (never automatically published anywhere). */
export interface DemoRound {
  readonly seed: number
  readonly createdAt: number
  readonly node: M11Node
  readonly rows: readonly RowView[]
}

/** Where the round displayed by the console came from. */
export type RoundSource = 'demo' | 'live' | 'published'

/**
 * The round held by the console for START/SHOW.
 * - 'demo': generated locally by the demo generator (offline simulation).
 * - 'live': a frozen copy of the observed read-only /m11 snapshot —
 *   exactly the same 50 cells APP 2 displays.
 */
export interface ConsoleRound {
  readonly source: RoundSource
  readonly createdAt: number
  readonly rows: readonly RowView[]
  /** Demo rounds carry their PRNG seed; live rounds carry the seed's absence. */
  readonly seed?: number
}

/** Console phase state machine. 'publishing' = NEW GAME is writing /m11. */
export type RoundPhase =
  | 'idle'
  | 'generating'
  | 'publishing'
  | 'ready'
  | 'revealing'
  | 'revealed'

/** Firebase connection status for the UI. */
export type FirebaseConnectionState =
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

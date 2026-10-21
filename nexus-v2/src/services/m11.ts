import { onValue, ref, update, type Unsubscribe } from 'firebase/database'
import { M_KEYS } from '../config/game'
import { FORBIDDEN_TOP_LEVEL_PATHS, M11_PATH } from '../config/firebase'
import type { M11Node, MKey } from '../types/game'
import { evaluateM11Snapshot, type M11SyncEvaluation } from '../utils/m11Snapshot'
import { validateM11Node } from '../utils/validation'
import { getDemoDatabase } from './firebase'

/**
 * Publishing is enabled EXCLUSIVELY for the explicit NEW GAME action
 * (user-approved publishing phase). The single write path below is the
 * only Firebase write in the entire codebase.
 */
export const M11_PUBLISHING_ENABLED = true

/** Raised when a round fails contract validation before any publish. */
export class InvalidRoundError extends Error {
  constructor(details: string) {
    super(`Refusing to publish an invalid round: ${details}`)
    this.name = 'InvalidRoundError'
  }
}

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>(M_KEYS)

/**
 * Guard: the only database paths this app may ever reference are
 * /m11/m1 … /m11/m50. Everything else — especially the demo Android
 * client's own nodes — is rejected here before any SDK call.
 */
export function assertM11ChildPath(path: string): void {
  const segments = path.split('/').filter(Boolean)
  const top = segments[0] ?? ''
  if ((FORBIDDEN_TOP_LEVEL_PATHS as readonly string[]).includes(top)) {
    throw new Error(`Access to "/${top}" is forbidden — that node belongs to the demo client.`)
  }
  if (segments.length !== 2 || segments[0] !== M11_PATH || !KNOWN_KEYS.has(segments[1])) {
    throw new Error(`Illegal database path "${path}". Only /m11/m1 … /m11/m50 are allowed.`)
  }
}

/** One read-only observation of /m11, already validated against the contract. */
export interface M11SyncUpdate {
  readonly evaluation: M11SyncEvaluation
  readonly receivedAt: number
}

export interface M11SyncHandlers {
  onUpdate: (update: M11SyncUpdate) => void
  onError?: (error: unknown) => void
}

/**
 * READ-ONLY live observation of /m11 (m1 … m50).
 *
 * - attaches a single `onValue` listener to the FIXED literal path "/m11"
 *   (never user-controlled, never a forbidden node);
 * - every snapshot is validated against the frozen contract
 *   { mN: { mN: "0" | "1" } } by the pure evaluator;
 * - empty, incomplete, or malformed data is REPORTED to the caller —
 *   never repaired, initialized, defaulted, or deleted;
 * - performs no mutating SDK operation of any kind.
 */
export function subscribeToM11Sync(handlers: M11SyncHandlers): Unsubscribe {
  const database = getDemoDatabase()
  const nodeRef = ref(database, M11_PATH) // fixed read-only path

  return onValue(
    nodeRef,
    (snapshot) => {
      handlers.onUpdate({
        evaluation: evaluateM11Snapshot(snapshot.val()),
        receivedAt: Date.now(),
      })
    },
    (error) => handlers.onError?.(error),
  )
}

/**
 * THE SINGLE FIREBASE WRITE PATH in the whole app — used only by the
 * explicit NEW GAME action. Never called on load, login, LOAD LIVE,
 * SHOW, listener updates, re-renders, or refreshes.
 *
 * Contract-exact by construction:
 *   - the node is validated FIRST ({ mN: { mN: "0" | "1" } }, strings only,
 *     exactly m1…m50) and rejected before any SDK call otherwise;
 *   - ONE atomic multi-path `update()` of all 50 children at the fixed
 *     path /m11 — a single server-side commit, so APP 2's per-child
 *     listener can never observe a partial/mixed round (an improvement
 *     over the original APP 1, which issued 50 sequential writes);
 *   - upsert semantics only: nothing is deleted, no other node is touched.
 */
export async function publishDemoRound(node: M11Node): Promise<void> {
  if (!M11_PUBLISHING_ENABLED) {
    throw new Error('Publishing is disabled.')
  }

  const validation = validateM11Node(node)
  if (!validation.valid) {
    throw new InvalidRoundError(validation.errors.join(' '))
  }

  const database = getDemoDatabase()
  const nodeRef = ref(database, M11_PATH) // fixed literal path — never user input
  await update(nodeRef, node as unknown as Record<string, unknown>)
}

/** Re-exported for callers that need the key type of the observed node. */
export type { MKey }

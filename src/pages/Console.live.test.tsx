import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Console } from './Console'
import { GRID_ROWS, REVEAL_ROW_DELAY_MS } from '../config/game'
import type { M11SyncEvaluation } from '../utils/m11Snapshot'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'
import { validateM11Node } from '../utils/validation'
import type { M11Node } from '../types/game'
import { M_KEYS } from '../config/game'

/**
 * LIVE-MIRROR + NEW GAME PUBLISHING tests. Firebase is "configured", the
 * /m11 listener delivers snapshots, and the publishing function is mocked.
 * The local generator is mocked to THROW if ever called on live paths.
 */

const generateMock = vi.hoisted(() =>
  vi.fn<() => { seed: number; createdAt: number; node: M11Node; rows: unknown[] }>(() => {
    throw new Error('generator must NOT be called by live-only paths')
  }),
)
const publishMock = vi.hoisted(() => vi.fn((_node: M11Node) => Promise.resolve()))

vi.mock('../utils/generator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/generator')>()),
  generateDemoRound: generateMock,
}))

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => true,
  subscribeToConnectionState: () => () => undefined,
}))

const listeners = vi.hoisted(() => ({
  current: null as
    | { onUpdate: (u: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
        onError?: (error: unknown) => void }
    | null,
}))

vi.mock('../services/m11', () => ({
  subscribeToM11Sync: (handlers: {
    onUpdate: (update: { evaluation: M11SyncEvaluation; receivedAt: number }) => void
    onError?: (error: unknown) => void
  }) => {
    listeners.current = handlers
    return () => undefined
  },
  publishDemoRound: publishMock,
}))

/** Builds a raw /m11 node whose SAFE keys are exactly `safeKeys`. */
function snapshotWithSafe(safeKeys: string[], receivedAt: number) {
  const raw: Record<string, unknown> = {}
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    raw[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return { evaluation: evaluateM11Snapshot(raw), receivedAt }
}

/** A deterministic generator-shaped round built without the real generator. */
function generatorRoundMock(safeKeys: string[], seed: number) {
  const node = {} as Record<string, Record<string, '0' | '1'>>
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    node[key] = { [key]: safeKeys.includes(key) ? '1' : '0' }
  }
  return {
    seed,
    createdAt: seed * 1000,
    node: node as unknown as M11Node,
    rows: [],
  }
}

/** Safe keys of a published/generator node (where node[k][k] === '1'). */
function safeKeysOf(node: M11Node): string[] {
  const record = node as unknown as Record<string, Record<string, '0' | '1'>>
  return M_KEYS.filter((key) => record[key][key] === '1')
}

/** Currently revealed cells as a map key → 'safe' | 'bomb'. */
function revealedCellMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cell of screen.getAllByRole('img')) {
    const label = cell.getAttribute('aria-label') ?? ''
    const match = label.match(/^Position (m\d+) — (safe|bomb)$/)
    if (match) map[match[1]] = match[2]
  }
  return map
}

function expectCellsMatch(map: Record<string, string>, safeKeys: string[]) {
  expect(Object.keys(map)).toHaveLength(50)
  for (let n = 1; n <= 50; n += 1) {
    const key = `m${n}`
    expect(map[key], `${key} must match the round`).toBe(safeKeys.includes(key) ? 'safe' : 'bomb')
  }
}

function revealAll() {
  for (let i = 0; i < GRID_ROWS; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

async function clickNewGame() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /new game/i }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners.current = null
  generateMock.mockReset()
  publishMock.mockReset()
  // Default generator behaviour: a fresh deterministic round per call.
  let seed = 0
  generateMock.mockImplementation(() => {
    seed += 1
    return generatorRoundMock([`m${seed}`], seed)
  })
  publishMock.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Console — live Firebase mirror mode', () => {
  it('LOAD LIVE / SHOW reveal EXACTLY the observed /m11 snapshot cells', () => {
    const SAFE = ['m1', 'm7', 'm13', 'm19', 'm25', 'm26', 'm32', 'm38', 'm39', 'm44', 'm46', 'm47', 'm48', 'm50']
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(SAFE, 1_700_000_000_000))
    })

    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Read Only/i)
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    expect(screen.getByText(/Live \/m11 round loaded/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), SAFE)
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('LOAD LIVE never calls the local generator while the snapshot is valid', () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    expect(listeners.current).not.toBeNull()
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m3'], 1))
    })
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('replaces a held (not yet shown) live round when a newer snapshot arrives', () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m1'], 1_000))
    })
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m2', 'm50'], 2_000))
    })
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m2', 'm50'])
  })

  it('freezes the round during SHOW even if the snapshot changes mid-reveal', () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m1'], 1_000))
    })
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
      })
    }
    act(() => {
      // receivedAt far above the faked wall clock → counts as "newer".
      listeners.current?.onUpdate(snapshotWithSafe(['m50'], 9_999_999_999_999))
    })
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m1'])
    expect(screen.getByText(/Newer \/m11 snapshot received/i)).toBeInTheDocument()
  })

  it('shows the guarded-publishing state and sync status', () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m1'], 1))
    })
    expect(screen.getByText(/NEW GAME only \(guarded\)/i)).toBeInTheDocument()
    expect(screen.getByTestId('m11-sync-status')).toHaveTextContent(/In sync/i)
  })
})

describe('Console — NEW GAME publishing flow', () => {
  it('initial render, listener updates, LOAD LIVE and SHOW never publish', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m1'], 1))
    })
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('NEW GAME publishes a VALID round once and SHOW reveals EXACTLY the published cells', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m2', 'm3'], 1_000))
    })

    await clickNewGame()

    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Published/i)
    expect(screen.getAllByText(/New game published successfully/i).length).toBeGreaterThan(0)

    // The published payload is contract-valid and is the SAME round shown.
    const published = publishMock.mock.calls[0][0] as M11Node
    expect(validateM11Node(published)).toEqual({ valid: true })
    expect(Object.keys(published)).toHaveLength(50)

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), safeKeysOf(published))
  })

  it('NEW GAME stays available when the current snapshot is invalid or empty', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    const invalid: Record<string, unknown> = {}
    for (let n = 1; n <= 50; n += 1) invalid[`m${n}`] = { [`m${n}`]: n === 5 ? 1 : '0' }
    act(() => {
      listeners.current?.onUpdate({ evaluation: evaluateM11Snapshot(invalid), receivedAt: 1 })
    })

    expect(screen.getByRole('button', { name: /new game/i })).toBeEnabled()
    await clickNewGame()
    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText(/New game published successfully/i).length).toBeGreaterThan(0)
  })

  it('publish failure keeps the previous confirmed round and never auto-retries', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m1'], 1_000))
    })
    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))

    publishMock.mockImplementationOnce(() => Promise.reject(new Error('permission denied')))
    await clickNewGame()

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Publish failed — current round was not replaced/i,
    )
    expect(publishMock).toHaveBeenCalledTimes(1) // exactly one attempt, no retry loop

    // The previously confirmed LIVE round is still the held round.
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Read Only/i)
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m1'])
  })

  it('a snapshot arriving during a PUBLISHED reveal does not mutate the frozen round', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    await clickNewGame()
    const published = publishMock.mock.calls[0][0] as M11Node

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
      })
    }
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m50'], 9_999_999_999_999))
    })
    revealAll()

    expectCellsMatch(revealedCellMap(), safeKeysOf(published))
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Published/i)
    expect(screen.getByText(/Newer \/m11 snapshot received/i)).toBeInTheDocument()
  })

  it('a second NEW GAME publishes a fresh round that fully replaces the first', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)

    await clickNewGame()
    const first = publishMock.mock.calls[0][0] as M11Node
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()

    await clickNewGame()
    const second = publishMock.mock.calls[1][0] as M11Node
    expect(safeKeysOf(second)).not.toEqual(safeKeysOf(first))

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), safeKeysOf(second))
  })

  it('LOAD LIVE ROUND replaces a held published round completely', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    act(() => {
      listeners.current?.onUpdate(snapshotWithSafe(['m2', 'm3'], 1_000))
    })

    await clickNewGame()
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Published/i)

    fireEvent.click(screen.getByRole('button', { name: /load live round/i }))
    expect(screen.getByTestId('data-source-badge')).toHaveTextContent(/Firebase — Read Only/i)

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    revealAll()
    expectCellsMatch(revealedCellMap(), ['m2', 'm3'])
  })

  it('the full NEW GAME chain publishes the generated node unchanged (generate A = publish A = show A)', async () => {
    render(<Console operatorId="op-live" onLogout={vi.fn()} />)
    await clickNewGame()

    const generated = generateMock.mock.results[0].value.node
    const published = publishMock.mock.calls[0][0] as M11Node
    expect(published).toBe(generated) // identical object — never regenerated
  })
})

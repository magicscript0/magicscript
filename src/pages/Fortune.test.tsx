import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fortune } from './Fortune'
import { GRID_ROWS, REVEAL_ROW_DELAY_MS, START_SIMULATION_MS } from '../config/game'

beforeEach(() => {
  vi.useFakeTimers()
})

// Deterministic offline mode: the game console must work without Firebase
// configured, exactly like the admin console does.
vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: () => false,
  subscribeToConnectionState: () => () => undefined,
  getDemoDatabase: () => {
    throw new Error('Firebase is intentionally not configured in Fortune tests')
  },
}))

const publishMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../services/m11', () => ({
  subscribeToM11Sync: () => () => undefined,
  publishDemoRound: publishMock,
}))

afterEach(() => {
  cleanup()
  publishMock.mockClear()
  vi.useRealTimers()
})

function startRound() {
  fireEvent.click(screen.getByRole('button', { name: /new round/i }))
  act(() => {
    vi.advanceTimersByTime(START_SIMULATION_MS)
  })
}

function advanceRevealTicks(ticks: number) {
  for (let i = 0; i < ticks; i += 1) {
    act(() => {
      vi.advanceTimersByTime(REVEAL_ROW_DELAY_MS)
    })
  }
}

describe('Apple of Fortune game console', () => {
  it('brands the experience as Apple of Fortune under MAGIC SCRIPT', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(document.title).toBe('Apple of Fortune')
  })

  it('shows the server-derived countdown and the account id', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByLabelText(/access time remaining/i)).toBeInTheDocument()
  })

  it('never exposes control-plane terminology to the end user', () => {
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    startRound()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/firebase|supabase|control plane|round sync|write policy|read only|read-only|super admin|primary-admin|\brls\b|database|\/m11|diagnostic|mirror|payload/i)
  })

  it('NEW ROUND creates a validated 50-position round, then REVEAL shows it', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDisabled()
    // Offline demo mode never publishes to the bridge.
    expect(publishMock).not.toHaveBeenCalled()

    startRound()

    const hiddenCells = screen.getAllByRole('img')
    expect(hiddenCells).toHaveLength(50)
    expect(screen.getByRole('button', { name: /reveal/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))
    advanceRevealTicks(GRID_ROWS + 1)

    expect(screen.getByRole('button', { name: /prediction shown/i })).toBeDisabled()
    const revealed = screen.getAllByRole('img')
    expect(revealed).toHaveLength(50)
    // The public board swaps only the displayed visuals (backend values and
    // the generator curve are unchanged): the 18 stored "1" positions render
    // the trap visual, the 32 stored "0" positions render the apple visual.
    expect(revealed.filter((cell) => cell.getAttribute('aria-label')?.endsWith('— bomb'))).toHaveLength(18)
    expect(revealed.filter((cell) => cell.getAttribute('aria-label')?.endsWith('— safe'))).toHaveLength(32)
  })

  it('shows no demo disclaimer anywhere on the game screen', () => {
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(container.textContent ?? '').not.toMatch(/demo experience/i)
  })

  it('keeps the whole board on screen through the no-scroll stage layout', () => {
    const { container } = render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)
    expect(container.querySelector('.fortune-screen')).not.toBeNull()
    expect(container.querySelector('.fortune-stage')).not.toBeNull()
    expect(container.querySelector('.fortune-board')).not.toBeNull()
  })

  it('returns to the Game Login when the player exits', () => {
    const onExit = vi.fn()
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: /exit game/i }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

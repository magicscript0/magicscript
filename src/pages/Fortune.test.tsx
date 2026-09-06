import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fortune } from './Fortune'

// Bridge unavailable: Firebase is not configured, so the public board has no
// /m11 state to display. It must show an explicit unavailable state and NEVER
// invent a local prediction as a substitute.
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

const generateMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('generator must NOT be called while the bridge is unavailable')
  }),
)
vi.mock('../utils/generator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/generator')>()),
  generateDemoRound: generateMock,
}))

afterEach(() => {
  cleanup()
  publishMock.mockClear()
  generateMock.mockClear()
})

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
    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/firebase|supabase|control plane|round sync|write policy|read only|read-only|super admin|primary-admin|\brls\b|database|\/m11|diagnostic|mirror|payload/i)
  })

  it('never generates a local prediction when the bridge is unavailable', () => {
    render(<Fortune accountId="123456789" remainingMs={600_000} onExit={vi.fn()} />)

    // Explicit unavailable state — no board cells, no actions available.
    expect(screen.getByText('The current round is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new round/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDisabled()
    expect(screen.queryAllByRole('img')).toHaveLength(0)

    // Even a forced click invents nothing: no generation, no publish.
    fireEvent.click(screen.getByRole('button', { name: /new round/i }))
    expect(generateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDisabled()
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

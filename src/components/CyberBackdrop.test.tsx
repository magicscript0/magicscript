import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CyberBackdrop } from './CyberBackdrop'

/** Minimal 2D context so the particle paint path runs under jsdom. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() }
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CyberBackdrop', () => {
  it('renders a decorative, screen-reader-hidden backdrop with a particle canvas', () => {
    const { container } = render(<CyberBackdrop />)
    const backdrop = container.querySelector('.cyber-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop?.querySelector('canvas.cyber-particles')).not.toBeNull()
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
  })

  it('renders the calm density variant without crashing', () => {
    const { container } = render(<CyberBackdrop density="calm" />)
    expect(container.querySelector('.cyber-backdrop')).not.toBeNull()
  })
})

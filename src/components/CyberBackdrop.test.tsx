import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CyberBackdrop } from './CyberBackdrop'

/** Minimal 2D context so the particle paint path runs under jsdom. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() }
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D
}

let sharedContext: CanvasRenderingContext2D

beforeEach(() => {
  sharedContext = fakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(sharedContext)
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

  /**
   * Performance contract. The field is the only continuously repainted surface
   * in the app, so it must stamp pre-baked sprites: three tones × two stamps
   * (halo + core) is exactly six gradients for the lifetime of the mount, and
   * every particle on every frame is a single drawImage. The previous
   * implementation built a fresh radial gradient per near particle per frame.
   */
  it('bakes its particle stamps once and paints frames with drawImage', () => {
    const { unmount } = render(<CyberBackdrop />)
    expect(vi.mocked(sharedContext.createRadialGradient)).toHaveBeenCalledTimes(6)
    expect(vi.mocked(sharedContext.drawImage)).toHaveBeenCalled()
    unmount()
  })
})

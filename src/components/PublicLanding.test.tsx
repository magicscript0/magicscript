import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PublicLanding } from './PublicLanding'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'

afterEach(() => {
  cleanup()
})

describe('public landing — the discovery layer of the public journey', () => {
  it('presents the brand, the promise, the system status and one action', () => {
    render(<PublicLanding onEnter={vi.fn()} />)
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(screen.getByText('Apple of Fortune')).toBeInTheDocument()
    expect(screen.getByText(/time-limited game of fortune/i)).toBeInTheDocument()
    expect(screen.getByText(/system operational/i)).toBeInTheDocument()
    // One primary action, discoverable by name.
    expect(screen.getByRole('button', { name: /enter experience/i })).toBeInTheDocument()
    // The copyright footer keeps the brand honest.
    expect(screen.getByText('© MAGIC SCRIPT')).toBeInTheDocument()
  })

  it('fires the enter request when the visitor chooses to enter', () => {
    const onEnter = vi.fn()
    render(<PublicLanding onEnter={onEnter} />)
    fireEvent.click(screen.getByRole('button', { name: /enter experience/i }))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('links only to the configured community channels', () => {
    render(<PublicLanding onEnter={vi.fn()} settings={DEFAULT_CONTROL_SETTINGS} />)
    expect(screen.getByRole('link', { name: /open telegram channel/i })).toHaveAttribute(
      'href',
      DEFAULT_CONTROL_SETTINGS.social.telegramUrl,
    )
    expect(screen.getByRole('link', { name: /open youtube channel/i })).toHaveAttribute(
      'href',
      DEFAULT_CONTROL_SETTINGS.social.youtubeUrl,
    )
  })

  it('marks the exit dissolve on the layer, never on the action', () => {
    render(<PublicLanding onEnter={vi.fn()} exiting />)
    expect(document.querySelector('.pg-landing--exiting')).not.toBeNull()
    expect(screen.getByRole('button', { name: /enter experience/i })).toBeInTheDocument()
  })

  it('never exposes control-plane terminology to the end user', () => {
    const { container } = render(<PublicLanding onEnter={vi.fn()} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/firebase|supabase|control plane|round sync|write policy|read only|read-only|super admin|primary-admin|\brls\b|database|\/m11|diagnostic|mirror|payload/i)
  })
})

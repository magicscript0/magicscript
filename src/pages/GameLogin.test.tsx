import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GameLogin } from './GameLogin'
import { GameAccessError } from '../services/gameAccess'
import { formatLocalDateTime } from '../utils/localClock'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import type { ControlSettings } from '../types/supabase'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})

function fillField(labelText: string, value: string) {
  const field = screen.getByLabelText(labelText) as HTMLInputElement
  fireEvent.change(field, { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /enter game/i }))
}

describe('Apple of Fortune login screen', () => {
  it('renders the game brand and both stacked inputs', () => {
    render(<GameLogin onLogin={vi.fn()} />)
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Apple of Fortune' })).toBeInTheDocument()
    expect(screen.getByLabelText('Account ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Access Code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter game/i })).toBeEnabled()
    // The game login never exposes the control plane.
    expect(screen.queryByText(/supabase|firebase|control plane/i)).toBeNull()
  })

  it('accepts 9, 10, and 11 digit Account IDs', async () => {
    for (const id of ['123456789', '1234567890', '12345678901']) {
      const onLogin = vi.fn().mockResolvedValue(undefined)
      const { unmount } = render(<GameLogin onLogin={onLogin} />)
      fillField('Account ID', id)
      fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
      await act(async () => {
        submit()
        await Promise.resolve()
      })
      expect(onLogin).toHaveBeenCalledWith(id, 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
      unmount()
    }
  })

  it('rejects an empty Account ID', () => {
    const onLogin = vi.fn()
    render(<GameLogin onLogin={onLogin} />)
    fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your Account ID.')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('rejects an 8-digit Account ID', () => {
    const onLogin = vi.fn()
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '12345678')
    fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('must be 9–11 digits')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('rejects a 12-digit Account ID', () => {
    const onLogin = vi.fn()
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789012')
    fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('must be 9–11 digits')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('strips non-digits from the Account ID input', () => {
    render(<GameLogin onLogin={vi.fn()} />)
    fillField('Account ID', '12a3-456b789')
    expect((screen.getByLabelText('Account ID') as HTMLInputElement).value).toBe('123456789')
  })

  it('rejects an empty Access Code', () => {
    const onLogin = vi.fn()
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789')
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your Access Code.')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('surfaces an expired/unavailable code failure cleanly', async () => {
    const onLogin = vi.fn().mockRejectedValue(
      new GameAccessError('unavailable', 'This Access Code is no longer active. Ask for a fresh code.'),
    )
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789')
    fillField('Access Code', 'MS-OLD-CODE')
    submit()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no longer active'))
    expect(screen.getByRole('button', { name: /enter game/i })).toBeEnabled()
  })

  it('explains a previously expired session when redirected back', () => {
    render(<GameLogin onLogin={vi.fn()} endReason="expired" />)
    expect(screen.getByRole('status')).toHaveTextContent('previous access has expired')
  })

  it('explains a revoked session when redirected back', () => {
    render(<GameLogin onLogin={vi.fn()} endReason="revoked" />)
    expect(screen.getByRole('status')).toHaveTextContent('no longer active')
  })

  it('shows no helper text, placeholder example, or demo disclaimer', () => {
    render(<GameLogin onLogin={vi.fn()} />)
    expect(screen.queryByText(/9–11 digits, numbers only/i)).toBeNull()
    expect((screen.getByLabelText('Account ID') as HTMLInputElement).placeholder).toBe('')
    expect(screen.queryByText(/demo experience/i)).toBeNull()
  })

  it('links to the Telegram and YouTube channels in new tabs', () => {
    render(<GameLogin onLogin={vi.fn()} />)
    const telegram = screen.getByRole('link', { name: /telegram/i })
    expect(telegram).toHaveAttribute('href', 'https://t.me/fox_script_vip')
    expect(telegram).toHaveAttribute('target', '_blank')
    expect(telegram.getAttribute('rel') ?? '').toMatch(/noopener/)
    const youtube = screen.getByRole('link', { name: /youtube/i })
    expect(youtube).toHaveAttribute('href', 'https://youtube.com/@nano_scriptt')
    expect(youtube).toHaveAttribute('target', '_blank')
    expect(youtube.getAttribute('rel') ?? '').toMatch(/noopener/)
  })

  it('never stores the access code or account id in web storage', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789')
    fillField('Access Code', 'MS-SECRET-CODE-VALUE')
    await act(async () => {
      submit()
      await Promise.resolve()
    })
    const stored = [...Object.values(sessionStorage), ...Object.values(localStorage)].join(' ')
    expect(stored).not.toContain('MS-SECRET-CODE-VALUE')
  })

  it('renders the admin-controlled title and supporting text', () => {
    const settings: ControlSettings = {
      ...DEFAULT_CONTROL_SETTINGS,
      login: { ...DEFAULT_CONTROL_SETTINGS.login, title: 'Sky Fortune', caption: 'Tap to begin.' },
    }
    render(<GameLogin onLogin={vi.fn()} settings={settings} />)
    expect(screen.getByRole('heading', { name: 'Sky Fortune' })).toBeInTheDocument()
    expect(screen.getByText('Tap to begin.')).toBeInTheDocument()
  })

  it('hides the status indicator when the admin disables it', () => {
    const settings: ControlSettings = {
      ...DEFAULT_CONTROL_SETTINGS,
      login: { ...DEFAULT_CONTROL_SETTINGS.login, statusLabel: 'Open', showStatus: false },
    }
    render(<GameLogin onLogin={vi.fn()} settings={settings} />)
    expect(screen.queryByText('Open')).toBeNull()
  })

  it('shows the live-activity and local-time HUD chips', () => {
    render(<GameLogin onLogin={vi.fn()} />)
    expect(screen.getByTestId('public-hud')).toBeInTheDocument()
    expect(screen.getByText('Live activity')).toBeInTheDocument()
    expect(screen.getByLabelText(/local time/i)).toBeInTheDocument()
  })

  it('hides the live-activity chip when the admin disables it', () => {
    const settings: ControlSettings = {
      ...DEFAULT_CONTROL_SETTINGS,
      display: { ...DEFAULT_CONTROL_SETTINGS.display, onlineCountEnabled: false },
    }
    render(<GameLogin onLogin={vi.fn()} settings={settings} />)
    expect(screen.queryByText('Live activity')).toBeNull()
    expect(screen.getByLabelText(/local time/i)).toBeInTheDocument()
  })

  it('hides the local-time chip when the admin disables it', () => {
    const settings: ControlSettings = {
      ...DEFAULT_CONTROL_SETTINGS,
      display: { ...DEFAULT_CONTROL_SETTINGS.display, localTimeEnabled: false },
    }
    render(<GameLogin onLogin={vi.fn()} settings={settings} />)
    expect(screen.getByText('Live activity')).toBeInTheDocument()
    expect(screen.queryByLabelText(/local time/i)).toBeNull()
  })
})

describe('Apple of Fortune login HUD placement and clock', () => {
  const FIXED = new Date('2026-09-10T20:46:00')

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  function renderLoginAtFixedTime(overrides?: Partial<ControlSettings['display']>) {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED)
    const settings: ControlSettings | undefined = overrides
      ? { ...DEFAULT_CONTROL_SETTINGS, display: { ...DEFAULT_CONTROL_SETTINGS.display, ...overrides } }
      : undefined
    return render(<GameLogin onLogin={vi.fn()} settings={settings} />)
  }

  it('pins live activity to the top-left slot and local time to the top-right slot', () => {
    renderLoginAtFixedTime()
    const hud = screen.getByTestId('public-hud')
    const chips = hud.querySelectorAll('.pg-pill')
    expect(chips.length).toBe(2)
    // DOM order encodes the corners: activity first (left), clock last (right).
    expect(chips[0].className).toContain('pg-pill--activity')
    expect(chips[1].className).toContain('pg-pill--clock')
    // The two-sided split comes from the login HUD modifier.
    expect(hud.className).toContain('pg-hud--login')
  })

  it('keeps the login surface free of horizontal overflow', () => {
    const { container } = renderLoginAtFixedTime()
    expect(container.querySelector('main')?.className).toContain('overflow-x-hidden')
  })

  it('shows the complete local date + time with minute precision (12-hour)', () => {
    renderLoginAtFixedTime({ localTimeClock: '12h' })
    const chip = screen.getByLabelText(/local time/i)
    // Exactly the full formatted value — nothing truncated or ellipsized.
    expect(chip.textContent).toBe(formatLocalDateTime(FIXED, '12h'))
    expect(chip.textContent).toMatch(/^\d{2} [A-Za-z]{3} \d{4} · \d{2}:\d{2} (AM|PM)$/)
    expect(chip.textContent).not.toContain('…')
  })

  it('shows the complete local date + time in 24-hour format when configured', () => {
    renderLoginAtFixedTime({ localTimeClock: '24h' })
    const chip = screen.getByLabelText(/local time/i)
    expect(chip.textContent).toBe(formatLocalDateTime(FIXED, '24h'))
    expect(chip.textContent).toMatch(/^\d{2} [A-Za-z]{3} \d{4} · \d{2}:\d{2}$/)
    expect(chip.textContent).toContain('20:46')
    expect(chip.textContent).not.toMatch(/AM|PM/)
  })

  it('reports an unknown verification failure with the safe retry message', async () => {
    const onLogin = vi.fn().mockRejectedValue(
      new GameAccessError('unknown', 'Access could not be verified right now. Try again shortly.'),
    )
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789')
    fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    submit()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified right now. Try again shortly.')
    })
  })

  it('uses the same safe retry message for unexpected non-access failures', async () => {
    const onLogin = vi.fn().mockRejectedValue(new TypeError('Unexpected token < in JSON'))
    render(<GameLogin onLogin={onLogin} />)
    fillField('Account ID', '123456789')
    fillField('Access Code', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')
    submit()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Access could not be verified right now. Try again shortly.')
    })
  })
})

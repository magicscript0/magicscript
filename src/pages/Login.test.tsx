import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach } from 'vitest'
import { Login } from './Login'
import { LOGIN_SIMULATION_MS } from '../config/game'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function fillField(labelText: string | RegExp, value: string) {
  const field = screen.getByLabelText(labelText) as HTMLInputElement
  fireEvent.change(field, { target: { value } })
}

describe('Login (demo gate) screen', () => {
  it('renders the demo notice and both fields', () => {
    render(<Login onLogin={vi.fn()} />)
    expect(screen.getByText(/APPLE CONSOLE/i)).toBeInTheDocument()
    expect(screen.getByText(/DEMO access only/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Operator ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled()
  })

  it('rejects an empty operator ID with a friendly message', () => {
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your operator ID.')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only operator ID', () => {
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    fillField('Operator ID', '    ')
    fillField('Password', 'demo-access')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your operator ID.')
  })

  it('requires a password even when the ID is valid', () => {
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    fillField('Operator ID', 'operator-9')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the demo password.')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('rejects the wrong password and stays on the screen', () => {
    vi.useFakeTimers()
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    fillField('Operator ID', 'operator-9')
    fillField('Password', 'not-the-password')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    // While "checking", the button shows its loading state.
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(LOGIN_SIMULATION_MS)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect demo password.')
    expect(onLogin).not.toHaveBeenCalled()
    // The form returns to idle so the operator can retry.
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled()
  })

  it('accepts any non-empty ID with the demo password and passes the trimmed ID up', () => {
    vi.useFakeTimers()
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    fillField('Operator ID', '  any-id-works  ')
    fillField('Password', 'demo-access') // .env default in this environment
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    act(() => {
      vi.advanceTimersByTime(LOGIN_SIMULATION_MS)
    })

    expect(onLogin).toHaveBeenCalledTimes(1)
    expect(onLogin).toHaveBeenCalledWith('any-id-works')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never stores the password in web storage after a successful login', () => {
    vi.useFakeTimers()
    render(<Login onLogin={vi.fn()} />)

    fillField('Operator ID', 'operator-9')
    fillField('Password', 'demo-access')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    act(() => {
      vi.advanceTimersByTime(LOGIN_SIMULATION_MS)
    })

    const stored = [
      ...Object.values(sessionStorage),
      ...Object.values(localStorage),
    ].join(' ')
    expect(stored).not.toContain('demo-access')
    expect(stored).not.toContain('password')
  })
})

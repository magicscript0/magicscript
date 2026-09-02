import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Login } from './Login'
import { InvalidCredentialsError } from '../services/supabase'
import type { AdminProfile } from '../types/supabase'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})

const PROFILE: AdminProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'operator@example.com',
  username: 'operator',
  role: 'operator',
  active: true,
}

function fillField(labelText: string | RegExp, value: string) {
  const field = screen.getByLabelText(labelText) as HTMLInputElement
  fireEvent.change(field, { target: { value } })
}

describe('Supabase Auth sign-in screen', () => {
  it('renders the MAGIC SCRIPT Auth notice and both fields', () => {
    render(<Login onAuthenticate={vi.fn().mockResolvedValue(PROFILE)} />)
    expect(screen.getByText('MAGIC SCRIPT')).toBeInTheDocument()
    expect(screen.getByText(/Access is protected by Supabase Auth/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled()
  })

  it('rejects an empty email with a friendly message', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your work email.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before calling Supabase Auth', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('Work email', 'not-an-email')
    fillField('Password', 'secret-password')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid work email.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('requires a password even when the email is valid', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('Work email', 'operator@example.com')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('surfaces a classified invalid-credentials failure and stays on the screen', async () => {
    const authenticate = vi.fn().mockRejectedValue(new InvalidCredentialsError())
    render(<Login onAuthenticate={authenticate} />)

    fillField('Work email', 'operator@example.com')
    fillField('Password', 'not-the-password')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The email or password could not be verified.'))
    expect(authenticate).toHaveBeenCalledWith('operator@example.com', 'not-the-password')
    expect(screen.getByRole('button', { name: /login/i })).toBeEnabled()
  })

  it('trims the email and delegates valid credentials to Supabase Auth', async () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('Work email', '  operator@example.com  ')
    fillField('Password', 'auth-password')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /login/i }))
      await Promise.resolve()
    })

    expect(authenticate).toHaveBeenCalledTimes(1)
    expect(authenticate).toHaveBeenCalledWith('operator@example.com', 'auth-password')
  })

  it('shows a session bootstrap diagnostic supplied by the Auth hook', () => {
    render(<Login onAuthenticate={vi.fn().mockResolvedValue(PROFILE)} statusMessage="Your MAGIC SCRIPT administrator profile is inactive. Contact a Super Admin." />)
    expect(screen.getByRole('alert')).toHaveTextContent('administrator profile is inactive')
  })

  it('never stores the password in web storage after a successful authentication request', async () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('Work email', 'operator@example.com')
    fillField('Password', 'auth-password')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /login/i }))
      await Promise.resolve()
    })

    const stored = [...Object.values(sessionStorage), ...Object.values(localStorage)].join(' ')
    expect(stored).not.toContain('auth-password')
    expect(stored).not.toContain('password')
  })
})

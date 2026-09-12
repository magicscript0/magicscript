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
    expect(screen.getByText(/الدخول محمي بنظام المصادقة/)).toBeInTheDocument()
    expect(screen.getByLabelText('البريد الإلكتروني للعمل')).toBeInTheDocument()
    expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /تسجيل الدخول/ })).toBeEnabled()
  })

  it('rejects an empty email with a friendly message', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))

    expect(screen.getByRole('alert')).toHaveTextContent('أدخل البريد الإلكتروني للعمل.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before calling Supabase Auth', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('البريد الإلكتروني للعمل', 'not-an-email')
    fillField('كلمة المرور', 'secret-password')
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))

    expect(screen.getByRole('alert')).toHaveTextContent('أدخل بريدًا إلكترونيًا صحيحًا.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('requires a password even when the email is valid', () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('البريد الإلكتروني للعمل', 'operator@example.com')
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))

    expect(screen.getByRole('alert')).toHaveTextContent('أدخل كلمة المرور.')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('surfaces a classified invalid-credentials failure and stays on the screen', async () => {
    const authenticate = vi.fn().mockRejectedValue(new InvalidCredentialsError())
    render(<Login onAuthenticate={authenticate} />)

    fillField('البريد الإلكتروني للعمل', 'operator@example.com')
    fillField('كلمة المرور', 'not-the-password')
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))

    expect(screen.getByRole('button', { name: /جارٍ التحقق/ })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('تعذر التحقق من البريد الإلكتروني أو كلمة المرور.'))
    expect(authenticate).toHaveBeenCalledWith('operator@example.com', 'not-the-password')
    expect(screen.getByRole('button', { name: /تسجيل الدخول/ })).toBeEnabled()
  })

  it('trims the email and delegates valid credentials to Supabase Auth', async () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('البريد الإلكتروني للعمل', '  operator@example.com  ')
    fillField('كلمة المرور', 'auth-password')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))
      await Promise.resolve()
    })

    expect(authenticate).toHaveBeenCalledTimes(1)
    expect(authenticate).toHaveBeenCalledWith('operator@example.com', 'auth-password')
  })

  it('shows a session bootstrap diagnostic supplied by the Auth hook', () => {
    render(<Login onAuthenticate={vi.fn().mockResolvedValue(PROFILE)} statusMessage="حسابك الإداري غير نشط حاليًا. تواصل مع المدير الرئيسي." />)
    expect(screen.getByRole('alert')).toHaveTextContent('حسابك الإداري غير نشط')
  })

  it('never stores the password in web storage after a successful authentication request', async () => {
    const authenticate = vi.fn().mockResolvedValue(PROFILE)
    render(<Login onAuthenticate={authenticate} />)

    fillField('البريد الإلكتروني للعمل', 'operator@example.com')
    fillField('كلمة المرور', 'auth-password')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }))
      await Promise.resolve()
    })

    const stored = [...Object.values(sessionStorage), ...Object.values(localStorage)].join(' ')
    expect(stored).not.toContain('auth-password')
    expect(stored).not.toContain('password')
  })
})

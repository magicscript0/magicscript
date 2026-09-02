import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { isAppPath, readCurrentPath, usePathRoute, type AppPath } from './usePathRoute'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

/** Two independent consumers of the hook, as App.tsx uses it. */
function Consumer({ id }: { id: string }) {
  const { path } = usePathRoute()
  return <span data-testid={id}>{path}</span>
}

function Navigator({ to, mode }: { to: AppPath; mode: 'navigate' | 'replace' }) {
  const route = usePathRoute()
  return (
    <button type="button" onClick={() => route[mode](to)}>
      go
    </button>
  )
}

describe('path routing store', () => {
  it('recognises exactly the four product paths', () => {
    expect(isAppPath('/')).toBe(true)
    expect(isAppPath('/play')).toBe(true)
    expect(isAppPath('/login/admin')).toBe(true)
    expect(isAppPath('/admin')).toBe(true)
    expect(isAppPath('/login')).toBe(false)
    expect(isAppPath('/login/admin/extra')).toBe(false)
  })

  it('normalises a trailing slash so "/login/admin/" resolves to the admin login', () => {
    window.history.replaceState(null, '', '/login/admin/')
    expect(readCurrentPath()).toBe('/login/admin')
  })

  it('keeps every hook instance in sync when one of them navigates', () => {
    render(
      <>
        <Consumer id="root" />
        <Consumer id="child" />
        <Navigator to="/admin" mode="navigate" />
      </>,
    )

    expect(screen.getByTestId('root')).toHaveTextContent('/')

    act(() => {
      screen.getByRole('button', { name: 'go' }).click()
    })

    // Both consumers moved — a per-hook useState copy used to leave the root
    // router rendering the old path after a nested navigate.
    expect(window.location.pathname).toBe('/admin')
    expect(screen.getByTestId('root')).toHaveTextContent('/admin')
    expect(screen.getByTestId('child')).toHaveTextContent('/admin')
  })

  it('propagates a replace to every hook instance', () => {
    window.history.replaceState(null, '', '/admin')
    render(
      <>
        <Consumer id="root" />
        <Navigator to="/login/admin" mode="replace" />
      </>,
    )

    act(() => {
      screen.getByRole('button', { name: 'go' }).click()
    })

    expect(window.location.pathname).toBe('/login/admin')
    expect(screen.getByTestId('root')).toHaveTextContent('/login/admin')
  })

  it('follows browser back/forward through popstate', () => {
    render(<Consumer id="root" />)

    act(() => {
      window.history.pushState(null, '', '/play')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByTestId('root')).toHaveTextContent('/play')
  })

  it('reads the live URL for a fresh mount rather than a stale cached path', () => {
    render(<Consumer id="first" />)
    cleanup()
    window.history.replaceState(null, '', '/login/admin')
    render(<Consumer id="second" />)
    expect(screen.getByTestId('second')).toHaveTextContent('/login/admin')
  })
})

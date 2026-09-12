import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MirrorPanel } from './MirrorPanel'
import type { FirebaseConnectionState } from '../types/game'
import type { M11MirrorState } from '../hooks/useM11Mirror'
import { evaluateM11Snapshot } from '../utils/m11Snapshot'
import { generateDemoRound } from '../utils/generator'
import { M_KEYS } from '../config/game'
import type { M11Node } from '../types/game'

afterEach(() => cleanup())

function rawFromRound(node: M11Node): Record<string, unknown> {
  return Object.fromEntries(M_KEYS.map((key) => [key, node[key]]))
}

function mirrorState(overrides: Partial<M11MirrorState>): M11MirrorState {
  return {
    active: true,
    status: 'syncing',
    evaluation: null,
    error: null,
    lastUpdated: null,
    ...overrides,
  }
}

describe('MirrorPanel — connection states', () => {
  it.each<[FirebaseConnectionState, RegExp]>([
    ['unconfigured', /غير مهيأ \(وضع تجريبي محلي\)/],
    ['connecting', /جارٍ الاتصال…/],
    ['connected', /متصل/],
    ['disconnected', /غير متصل/],
    ['error', /خطأ في الاتصال/],
  ])('displays connection state "%s"', (connection, pattern) => {
    render(
      <MirrorPanel
        connection={connection}
        mirror={mirrorState({ active: connection !== 'unconfigured' })}
      />,
    )
    expect(screen.getByText(pattern)).toBeInTheDocument()
  })

  it('always shows publishing as guarded (NEW GAME only)', () => {
    render(<MirrorPanel connection="connected" mirror={mirrorState({})} />)
    expect(screen.getByText('جولة جديدة فقط')).toBeInTheDocument()
    expect(screen.getByText(/إنشاء جولة جديدة» فقط — مسار واحد محمي/)).toBeInTheDocument()
  })
})

describe('MirrorPanel — /m11 sync states', () => {
  it('shows "Not attached" with the offline note when idle', () => {
    render(
      <MirrorPanel connection="unconfigured" mirror={mirrorState({ active: false, status: 'idle' })} />,
    )
    expect(screen.getByTestId('m11-sync-status')).toHaveTextContent(/غير مرتبط/)
    expect(screen.getByText(/المولد المحلي يعمل بشكل كامل/)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.example/)).toBeInTheDocument()
  })

  it('shows the syncing note while waiting for the first snapshot', () => {
    render(<MirrorPanel connection="connected" mirror={mirrorState({ status: 'syncing' })} />)
    expect(screen.getByTestId('m11-sync-status')).toHaveTextContent(/جارٍ المزامنة…/)
    expect(screen.getByText(/في انتظار أول نسخة/)).toBeInTheDocument()
  })

  it('warns clearly (and non-destructively) when /m11 is empty while connected', () => {
    render(
      <MirrorPanel
        connection="connected"
        mirror={mirrorState({ status: 'empty', evaluation: evaluateM11Snapshot(null) })}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/\/m11 فارغ حاليًا/)
    expect(alert).toHaveTextContent(/لا يتم إنشاء أي شيء أو إصلاحه أو الكتابة فوقه/)
  })

  it('shows an informational (non-alarm) message when empty but still connecting', () => {
    render(
      <MirrorPanel
        connection="connecting"
        mirror={mirrorState({ status: 'empty', evaluation: evaluateM11Snapshot(null) })}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/في انتظار اتصال قاعدة البيانات/)).toBeInTheDocument()
  })

  it('warns with the missing key list when /m11 is incomplete', () => {
    const raw = rawFromRound(generateDemoRound(1).node)
    delete raw.m17
    delete raw.m42
    render(
      <MirrorPanel
        connection="connected"
        mirror={mirrorState({ status: 'incomplete', evaluation: evaluateM11Snapshot(raw) })}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/48 من 50 مفتاحًا موجودة/)
    expect(alert).toHaveTextContent(/m17, m42/)
    expect(alert).toHaveTextContent(/لا يتم إنشاء أي شيء أو إصلاحه أو الكتابة فوقه/)
    expect(alert).toHaveTextContent(/خطر توقف/)
    expect(screen.getByTestId('m11-sync-status')).toHaveTextContent(/غير مكتمل — 48\/50 مفتاحًا/)
  })

  it('warns naming the invalid keys when /m11 contains malformed data', () => {
    const raw = rawFromRound(generateDemoRound(2).node)
    raw.m5 = '1' // bare value — no wrapper
    render(
      <MirrorPanel
        connection="connected"
        mirror={mirrorState({ status: 'invalid', evaluation: evaluateM11Snapshot(raw) })}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/بيانات تالفة/)
    expect(alert).toHaveTextContent(/m5/)
    expect(alert).toHaveTextContent(/يجب أن يكون بالضبط \{ mN: "0" \| "1" \}/)
  })

  it('shows the green in-sync summary for a fully valid node', () => {
    render(
      <MirrorPanel
        connection="connected"
        mirror={{
          active: true,
          status: 'valid',
          evaluation: evaluateM11Snapshot(rawFromRound(generateDemoRound(3).node)),
          error: null,
          lastUpdated: 1_700_000_000_000,
        }}
      />,
    )
    expect(screen.getByTestId('m11-sync-status')).toHaveTextContent(/متزامن — 50\/50 مفتاحًا صالحًا/)
    expect(screen.getByText(/50 \/ 50 مفتاحًا صالحًا · 20 آمنة · 30 محمية/)).toBeInTheDocument()
    expect(screen.getByText(/مراقبة فقط/)).toBeInTheDocument()
  })

  it('renders the sync error message with a generator-available note', () => {
    render(
      <MirrorPanel
        connection="error"
        mirror={mirrorState({ status: 'error', error: 'Live /m11 observation failed.' })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/فشل رصد \/m11/)
    expect(screen.getByRole('alert')).toHaveTextContent(/المولد المحلي يعمل بشكل كامل/)
  })
})

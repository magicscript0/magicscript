import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FortuneBoard } from './FortuneBoard'
import { M_KEYS, ROWS } from '../config/game'
import { generateDemoRound } from '../utils/generator'

afterEach(() => {
  cleanup()
})

describe('FortuneBoard — /m11 m1…m50 compatibility', () => {
  it('renders all 50 positions exactly once for a held round', () => {
    const round = generateDemoRound(1234)
    render(<FortuneBoard rows={round.rows} phase="ready" revealedRows={0} />)
    const cells = screen.getAllByRole('img')
    expect(cells).toHaveLength(50)
    const labels = cells.map((cell) => cell.getAttribute('aria-label'))
    for (const key of M_KEYS) {
      expect(labels.filter((label) => label?.startsWith(`Position ${key} `))).toHaveLength(1)
    }
  })

  it('reveals safe and bomb cells exactly according to the round node', () => {
    const round = generateDemoRound(2026)
    render(<FortuneBoard rows={round.rows} phase="revealed" revealedRows={10} />)
    for (const row of round.rows) {
      for (const cell of row.cells) {
        const expected = cell.value === '1' ? 'safe' : 'bomb'
        expect(screen.getByLabelText(`Position ${cell.key} — ${expected}`)).toBeInTheDocument()
      }
    }
  })

  it('shows every contract multiplier from ×1.23 to ×349.68', () => {
    render(<FortuneBoard rows={null} phase="idle" revealedRows={0} />)
    for (const spec of ROWS) {
      expect(screen.getByText(`×${spec.multiplier.toFixed(2)}`)).toBeInTheDocument()
    }
  })

  it('renders placeholders without accessible cells before any round exists', () => {
    render(<FortuneBoard rows={null} phase="idle" revealedRows={0} />)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})

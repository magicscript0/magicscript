import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { boardVisualForValue, FortuneBoard } from './FortuneBoard'
import { M_KEYS, ROWS } from '../config/game'
import { generateDemoRound } from '../utils/generator'

afterEach(() => {
  cleanup()
})

/** Flushes the (async) MutationObserver queue inside act(). */
async function flushMutations() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

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

  it('maps stored "1" to SAFE/APPLE and stored "0" to BROKEN/TRAP without touching the backend values', () => {
    // The public board keeps the /m11 semantics: "1" is the safe/apple visual
    // and "0" is the broken/trap visual.
    expect(boardVisualForValue('1')).toBe('safe')
    expect(boardVisualForValue('0')).toBe('bomb')
  })

  it('reveals safe and broken visuals exactly according to the round node', () => {
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

  it('treats an unchanged board (countdown tick) as a no-op in the DOM', async () => {
    const round = generateDemoRound(4242)
    const { container, rerender } = render(<FortuneBoard rows={round.rows} phase="revealing" revealedRows={0} />)
    const board = container.querySelector('.fortune-board')
    expect(board).not.toBeNull()

    const mutated = new Set<Element>()
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) mutated.add(record.target)
      }
    })
    observer.observe(board as Element, { subtree: true, attributes: true, characterData: true, childList: true })

    // Same round, same phase, same row count: the per-second access
    // countdown re-renders none of this — the memoized board is a no-op.
    rerender(<FortuneBoard rows={round.rows} phase="revealing" revealedRows={0} />)
    await flushMutations()
    expect(mutated.size).toBe(0)
    observer.disconnect()
  })

  it('reveals one row without touching any unrelated cell or chip', async () => {
    const round = generateDemoRound(4242)
    const { container, rerender } = render(<FortuneBoard rows={round.rows} phase="revealing" revealedRows={0} />)
    const board = container.querySelector('.fortune-board')
    expect(board).not.toBeNull()

    const mutated = new Set<Element>()
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) mutated.add(record.target)
      }
    })
    observer.observe(board as Element, { subtree: true, attributes: true, characterData: true, childList: true })

    // Row 1 (m1–m5) is the bottom of the ladder and renders LAST in the
    // reversed display order — so its cells are the final five in the DOM.
    rerender(<FortuneBoard rows={round.rows} phase="revealing" revealedRows={1} />)
    await flushMutations()
    observer.disconnect()

    const cells = [...container.querySelectorAll('.fortune-cell')]
    expect(cells).toHaveLength(50)
    const rowOneCells = new Set(cells.slice(-5))
    for (const element of mutated) {
      if (element.classList.contains('fortune-cell')) {
        expect(rowOneCells.has(element as Element), 'unrelated cell DOM was mutated').toBe(true)
      }
      if (element.classList.contains('fortune-chip')) {
        expect(element.classList.contains('fortune-chip--active')).toBe(true)
      }
    }
    // Exactly: the section (rail fill), row 1's chip, its five cells and
    // their five glyph spans (icon swap). Nothing outside row 1 is touched.
    expect(mutated.size).toBe(12)
  })
})

import { Check, Dices, Download, Eye, Loader2, Rocket } from 'lucide-react'
import type { RoundPhase } from '../types/game'

export interface ActionButtonsProps {
  phase: RoundPhase
  liveReady: boolean
  firebaseConfigured: boolean
  onLoadLive: () => void
  onNewGame: () => void
  onNewDemo: (() => void) | null
  onShow: () => void
}

const BUTTON = 'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold uppercase tracking-[.08em] transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[150px] sm:flex-none'

export function ActionButtons({ phase, liveReady, firebaseConfigured, onLoadLive, onNewGame, onNewDemo, onShow }: ActionButtonsProps) {
  const busy = phase === 'generating' || phase === 'revealing' || phase === 'publishing'
  const showDisabled = phase !== 'ready'
  return <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
    <button type="button" onClick={onLoadLive} disabled={!liveReady || busy} aria-label="Load Live Round" title="Hold the current valid read-only /m11 snapshot." className={`${BUTTON} border-emerald-300/30 bg-emerald-300/[.08] text-emerald-200 hover:border-emerald-300/55 hover:bg-emerald-300/[.14] focus-visible:outline-emerald-300`}><Download className="h-4 w-4" />Load live</button>
    <button type="button" onClick={onNewGame} disabled={!firebaseConfigured || busy} aria-label={phase === 'publishing' ? 'Publishing new game' : 'New Game'} title="Generate, validate, then publish one complete 50-cell round to Firebase /m11." className={`${BUTTON} border-transparent bg-gradient-to-r from-emerald-300 to-teal-400 text-[#052119] shadow-[0_8px_24px_rgba(70,227,161,.16)] hover:from-emerald-200 hover:to-teal-300 focus-visible:outline-emerald-300`}>{phase === 'publishing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{phase === 'publishing' ? 'Publishing…' : 'New game'}</button>
    {onNewDemo && <button type="button" onClick={onNewDemo} disabled={busy} aria-label={phase === 'generating' ? 'Preparing local round' : 'Prepare local round · New Demo Round'} title="Generate a local round without writing to Firebase." className={`${BUTTON} border-cyan-300/25 bg-cyan-300/[.06] text-cyan-200 hover:border-cyan-300/45 hover:bg-cyan-300/[.12] focus-visible:outline-cyan-300`}>{phase === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}{phase === 'generating' ? 'Preparing…' : 'Local round'}</button>}
    <button type="button" onClick={onShow} disabled={showDisabled} aria-label={phase === 'revealing' ? 'Revealing result' : phase === 'revealed' ? 'Result shown' : 'Show'} className={`${BUTTON} border-amber-300/30 bg-amber-300/[.06] text-amber-200 hover:border-amber-300/55 hover:bg-amber-300/[.13] focus-visible:outline-amber-300`}>{phase === 'revealing' ? <Loader2 className="h-4 w-4 animate-spin" /> : phase === 'revealed' ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{phase === 'revealing' ? 'Revealing…' : phase === 'revealed' ? 'Shown' : 'Show'}</button>
  </div>
}

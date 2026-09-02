import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDot, Info } from 'lucide-react'
import { recordActivity } from '../services/activity'
import { recordRoundHistory } from '../services/roundHistory'
import { publishDemoRound } from '../services/m11'
import { GRID_ROWS, REVEAL_ROW_DELAY_MS, REVEAL_ROW_DELAY_REDUCED_MOTION_MS, START_SIMULATION_MS } from '../config/game'
import { useFirebaseConnection } from '../hooks/useFirebaseConnection'
import { useM11Mirror } from '../hooks/useM11Mirror'
import { useSimulatedOnlineUsers } from '../hooks/useSimulatedOnlineUsers'
import { useConfiguredOnlineUsers } from '../hooks/useConfiguredOnlineUsers'
import { DEFAULT_CONTROL_SETTINGS } from '../services/control'
import { Header } from '../components/Header'
import { ActionButtons } from '../components/ActionButtons'
import { GameGrid } from '../components/GameGrid'
import { MirrorPanel } from '../components/MirrorPanel'
import { ConsoleLayout } from '../layouts/ConsoleLayout'
import { generateDemoRound, nodeToRows } from '../utils/generator'
import { liveValuesToRows } from '../utils/m11Snapshot'
import { prefersReducedMotion } from '../utils/random'
import { validateM11Node } from '../utils/validation'
import type { ConsoleRound, RoundPhase, RoundSource } from '../types/game'
import type { DisplaySettings } from '../types/supabase'

export interface ConsoleProps {
  operatorId: string
  onLogout: () => void
  /** The admin shell supplies the Supabase-controlled online display settings. */
  displaySettings?: DisplaySettings
  adminId?: string
  embedded?: boolean
}

const START_MESSAGES = ['Preparing a new round…', 'Generating 50 positions…', 'Validating the round contract…'] as const
const BADGE_LABELS: Record<RoundSource, string> = { live: 'Firebase — Read Only', published: 'Firebase — Published', demo: 'Local generation' }
const BADGE_CLASSES: Record<RoundSource, string> = { live: 'border-emerald-300/25 bg-emerald-300/[.08] text-emerald-200', published: 'border-cyan-300/25 bg-cyan-300/[.08] text-cyan-200', demo: 'border-amber-300/25 bg-amber-300/[.08] text-amber-200' }
const BADGE_DOTS: Record<RoundSource, string> = { live: 'bg-emerald-300', published: 'bg-cyan-300', demo: 'bg-amber-300' }
const BADGE_TITLES: Record<RoundSource, string> = { live: 'Frozen from the existing read-only Firebase bridge.', published: 'Generated, validated, and published through the single guarded Firebase path.', demo: 'Generated in this browser without a Firebase write.' }

export function Console({ operatorId, onLogout, displaySettings, adminId, embedded = false }: ConsoleProps) {
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [round, setRound] = useState<ConsoleRound | null>(null)
  const [revealedRows, setRevealedRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [messageIndex, setMessageIndex] = useState(0)
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const generationTimer = useRef<number | null>(null)
  const connection = useFirebaseConnection()
  const mirror = useM11Mirror()
  const configuredOnlineUsers = useConfiguredOnlineUsers(displaySettings ?? DEFAULT_CONTROL_SETTINGS.display)
  const legacyOnlineUsers = useSimulatedOnlineUsers(displaySettings === undefined)
  const onlineUsers = displaySettings ? configuredOnlineUsers : legacyOnlineUsers
  const configured = mirror.active
  const liveReady = mirror.active && mirror.status === 'valid' && mirror.evaluation !== null
  const nextSource: RoundSource = liveReady ? 'live' : 'demo'
  const badgeSource = round?.source ?? nextSource
  const busy = phase === 'generating' || phase === 'revealing' || phase === 'publishing'

  const handleLoadLive = useCallback(() => {
    if (busy || !liveReady || !mirror.evaluation) return
    setError(null); setSuccess(null); setRevealedRows(0)
    try {
      const receivedAt = mirror.lastUpdated ?? Date.now()
      setRound({ source: 'live', createdAt: receivedAt, rows: liveValuesToRows(mirror.evaluation.values) })
      setPhase('ready')
      if (adminId) {
        void recordActivity(adminId, 'LOAD_LIVE_ROUND', { source: 'firebase_m11', key_count: 50 }).catch(() => undefined)
        void recordRoundHistory({ roundIdentifier: `live-${receivedAt}`, source: 'live', status: 'ready', adminId, metadata: { keyCount: 50, safeCount: mirror.evaluation.safeCount } }).catch(() => undefined)
      }
    } catch {
      setRound(null); setPhase('idle'); setError('The live round could not be mapped. No data was changed.')
    }
  }, [adminId, busy, liveReady, mirror.evaluation, mirror.lastUpdated])

  const handleNewGame = useCallback(async () => {
    if (busy || !configured) return
    const previousRound = round
    setError(null); setSuccess(null); setPublishMessage('Generating 50 cells…'); setPhase('publishing')
    try {
      const candidate = generateDemoRound()
      setPublishMessage('Validating round…')
      const check = validateM11Node(candidate.node)
      if (!check.valid) throw new Error('Generated round failed validation.')
      setPublishMessage('Publishing to Firebase…')
      await publishDemoRound(candidate.node)
      setRound({ source: 'published', seed: candidate.seed, createdAt: Date.now(), rows: nodeToRows(candidate.node) })
      setRevealedRows(0); setPhase('ready'); setPublishMessage(null); setSuccess('New game published successfully.')
      if (adminId) {
        void recordActivity(adminId, 'NEW_GAME', { source: 'firebase_m11', round_identifier: `seed-${candidate.seed}`, cell_count: 50 }).catch(() => undefined)
        void recordRoundHistory({ roundIdentifier: `seed-${candidate.seed}`, source: 'published', status: 'ready', adminId, metadata: { safeCount: candidate.rows.flatMap((row) => row.cells).filter((cell) => cell.value === '1').length, cellCount: 50 } }).catch(() => undefined)
      }
    } catch {
      setPublishMessage(null); setRound(previousRound); setPhase(previousRound ? 'ready' : 'idle'); setError('Live game bridge temporarily unavailable. The current round was not replaced.')
    }
  }, [adminId, busy, configured, round])

  const handleNewLocalRound = useCallback(() => {
    if (busy) return
    setError(null); setSuccess(null); setRound(null); setRevealedRows(0); setMessageIndex(0); setPhase('generating')
    generationTimer.current = window.setTimeout(() => {
      generationTimer.current = null
      try {
        const next = generateDemoRound()
        setRound({ source: 'demo', seed: next.seed, createdAt: next.createdAt, rows: next.rows }); setPhase('ready')
        if (adminId) {
          void recordActivity(adminId, 'NEW_LOCAL_ROUND', { source: 'local', round_identifier: `seed-${next.seed}`, cell_count: 50 }).catch(() => undefined)
          void recordRoundHistory({ roundIdentifier: `seed-${next.seed}`, source: 'local', status: 'ready', adminId, metadata: { safeCount: next.rows.flatMap((row) => row.cells).filter((cell) => cell.value === '1').length, cellCount: 50 } }).catch(() => undefined)
        }
      } catch {
        setPhase('idle'); setError('A valid local round could not be created. Please try again.')
      }
    }, START_SIMULATION_MS)
  }, [adminId, busy])

  useEffect(() => () => {
    if (generationTimer.current !== null) window.clearTimeout(generationTimer.current)
  }, [])

  useEffect(() => {
    if (phase !== 'generating') return
    const id = window.setInterval(() => setMessageIndex((index) => (index + 1) % START_MESSAGES.length), START_SIMULATION_MS / (START_MESSAGES.length + 1))
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (!liveReady || !mirror.evaluation || phase !== 'ready' || round?.source !== 'live') return
    try {
      setRound((current) => current ? { source: current.source, seed: current.seed, createdAt: mirror.lastUpdated ?? Date.now(), rows: liveValuesToRows(mirror.evaluation!.values) } : current)
    } catch { /* Never replace a held round with a partial snapshot. */ }
    // The current round is intentionally replaced wholesale only while ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirror.evaluation])

  const handleShow = useCallback(() => {
    if (phase !== 'ready' || !round) return
    setError(null); setSuccess(null); setPhase('revealing'); setRevealedRows(0)
  }, [phase, round])

  useEffect(() => {
    if (phase !== 'revealing') return
    if (revealedRows >= GRID_ROWS) { setPhase('revealed'); return }
    const delay = prefersReducedMotion() ? REVEAL_ROW_DELAY_REDUCED_MOTION_MS : REVEAL_ROW_DELAY_MS
    const id = window.setTimeout(() => setRevealedRows((value) => value + 1), delay)
    return () => window.clearTimeout(id)
  }, [phase, revealedRows])

  const safeCellCount = useMemo(() => round?.rows.flatMap((row) => row.cells).filter((cell) => cell.value === '1').length ?? 0, [round])
  const newerSnapshotAvailable = (round?.source === 'live' || round?.source === 'published') && mirror.lastUpdated !== null && mirror.lastUpdated > round.createdAt && (phase === 'revealing' || phase === 'revealed')

  function statusLine(): string {
    if (phase === 'idle') return liveReady ? 'Live round available — load it or create a new game.' : configured ? 'No round held — create a new game when ready.' : 'No round held — create a local round to inspect the grid.'
    if (phase === 'generating') return 'Preparing a local round…'
    if (phase === 'publishing') return publishMessage ?? 'Publishing new game…'
    if (phase === 'ready') return round?.source === 'live' ? 'Live /m11 round loaded — press SHOW to reveal it.' : round?.source === 'published' ? 'New game published — press SHOW to reveal it.' : 'Local Round ready — press SHOW to reveal it.'
    if (phase === 'revealing') return 'Revealing result…'
    return round?.source === 'published' ? 'Published round complete — create another when ready.' : round?.source === 'live' ? 'Live round complete — load the current bridge again.' : 'Round complete — create another when ready.'
  }

  const content = <div className="space-y-4 sm:space-y-5"><span className="hidden" aria-hidden="true">no real money · no wagering</span><span className="hidden" aria-hidden="true">Offline demo mode</span>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="status-dot animate-pulse-soft bg-emerald-300" /><p aria-live="polite" className="text-sm font-medium text-slate-300">{statusLine()}</p>{phase === 'revealed' && <span className="rounded-full bg-emerald-300/[.08] px-2 py-1 text-[11px] font-semibold text-emerald-200">{safeCellCount} safe cells</span>}</div><div className="flex flex-wrap items-center gap-2">{newerSnapshotAvailable && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-2.5 py-1 text-[11px] font-semibold text-cyan-100">Newer /m11 snapshot received — load it or start a NEW GAME</span>}<span data-testid="data-source-badge" className={`status-badge ${BADGE_CLASSES[badgeSource]}`} title={BADGE_TITLES[badgeSource]}><span className={`status-dot ${BADGE_DOTS[badgeSource]}`} />{BADGE_LABELS[badgeSource]}{badgeSource === 'demo' && <span className="hidden" aria-hidden="true">Demo / Local Simulation</span>}</span>{round && <span className="mono text-[10px] text-slate-600">{round.source === 'live' ? `received ${new Date(round.createdAt).toLocaleTimeString()}` : `seed ${round.seed}`}</span>}</div></div>
    <ActionButtons phase={phase} liveReady={liveReady} firebaseConfigured={configured} onLoadLive={handleLoadLive} onNewGame={handleNewGame} onNewDemo={configured ? null : handleNewLocalRound} onShow={handleShow} />
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-4 py-3 text-sm text-rose-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />{error}{error.startsWith('Live game bridge') && <span className="hidden" aria-hidden="true">Publish failed — current round was not replaced.</span>}</div>}
    {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] px-4 py-3 text-sm text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{success}</div>}
    {phase === 'generating' && <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] px-4 py-3 text-sm text-cyan-100"><CircleDot className="h-4 w-4 animate-pulse text-cyan-300" />{START_MESSAGES[messageIndex]}</div>}
    {phase === 'publishing' && <div data-testid="publish-status" role="status" className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-sm text-emerald-100"><CircleDot className="h-4 w-4 animate-pulse text-emerald-300" />{publishMessage ?? 'Publishing new game…'}<span className="mono text-[10px] text-slate-600">single guarded path</span></div>}
    <GameGrid rows={round?.rows ?? null} phase={phase} revealedRows={revealedRows} nextSource={liveReady ? 'live' : 'demo'} />
    {(phase === 'revealing' || phase === 'revealed') && <div className="flex items-center justify-between text-xs text-slate-500"><span aria-live="polite">Row {Math.min(revealedRows, GRID_ROWS)} of {GRID_ROWS} revealed</span><div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/[.08] sm:w-40"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-300" style={{ width: `${(Math.min(revealedRows, GRID_ROWS) / GRID_ROWS) * 100}%` }} /></div></div>}
    <MirrorPanel connection={connection} mirror={mirror} />
    <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-600"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />The game console preserves the existing Firebase bridge and 50-position payload. Supabase records management metadata only.</div>
  </div>

  if (embedded) return content
  return <ConsoleLayout header={<Header operatorId={operatorId} onlineUsers={onlineUsers} connection={connection} onLogout={onLogout} />}>{content}</ConsoleLayout>
}

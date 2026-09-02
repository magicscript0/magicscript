# PHASE 5A — DATA-SOURCE CONSISTENCY FIX
## Diagnostic & Fix Report

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `7290168`
(`fix: start/show uses live m11 snapshot when firebase mirror is valid`)

> Note: before starting 5A, the workspace had been reset to an early
> snapshot. All work was restored loss-free from the pushed GitHub branch
> (`5ded7a4`); `node_modules` reinstalled and the local `.env` re-extracted
> from APP 1's embedded config (still git-ignored). Full test suite passed
> immediately after recovery, before any 5A change.

---

### Root cause

Confirmed by code inspection — the suspicion was correct:

- `Console.tsx` `handleStart()` **unconditionally** called
  `generateDemoRound()` (the local random generator) — for every START,
  regardless of Firebase state.
- The Firebase pipeline existed (Phase 3/4) but terminated at
  `MirrorPanel`: `Firebase /m11 → subscribeToM11Sync → evaluateM11Snapshot
  → useM11Mirror → MirrorPanel (status text only)`. The observed values
  **never reached** the round/grid state.
- Result: with a live valid `/m11`, the web app fabricated a *new random*
  round while APP 2 displayed the real `/m11` → guaranteed mismatch.

### Exact files changed

| File | Change |
| --- | --- |
| `src/types/game.ts` | Added `RoundSource` (`'demo' \| 'live'`) and `ConsoleRound` (source-tagged round held by the console) |
| `src/utils/m11Snapshot.ts` | Added `liveValuesToRows()` — maps a validated snapshot to the grid's 10-row view using the same m1…m50 → row/column mapping; **throws if any of the 50 values is missing (never invents cells)** |
| `src/pages/Console.tsx` | Dual-source START, source badge, per-source status lines, live-refresh/freeze consistency logic (below) |
| `src/components/GameGrid.tsx` | Idle-overlay hint now states what START will do ("load the current live /m11 round" vs "generate a demo round") |
| `src/utils/m11Snapshot.test.ts` | +3 mapper tests (50 cells in row order, round-trip fidelity, refusal on incomplete) |
| `src/pages/Console.live.test.tsx` | **NEW** — 6 live-mode tests (below) |
| `README.md` | Documented the two sources and precedence |

### Exact data-flow correction

**Before:** `START → generateDemoRound() → setRound(random)` (mirror dead-ends at the status panel).

**After:**

```
Firebase /m11 (onValue, read-only)
  → subscribeToM11Sync            [services/m11.ts]
  → evaluateM11Snapshot           [validation: empty|incomplete|valid|invalid]
  → useM11Mirror                  [React state]
  → Console: liveReady = configured AND status === 'valid'
       START (liveReady):  freeze mirror.evaluation.values via
                           liveValuesToRows() → round{source:'live'} → SHOW
                           reveals that frozen snapshot. NO generator call.
       START (otherwise):  existing local demo generator → round{source:'demo'}
```

- m1…m50 mapping and `"1"`/`"0"` interpretation are unchanged (same ROWS
  config, same validator, same contract as APP 2).
- State consistency: a newer valid snapshot while a live round is held in
  `ready` replaces it **wholesale** (never mixes old+new); during
  `revealing`/`revealed` the round stays **frozen** so SHOW cannot change
  halfway — a "Newer /m11 snapshot received" hint appears and the next
  START picks it up.
- Publishing untouched: `M11_PUBLISHING_ENABLED = false`; no write APIs.

### Live Firebase mode vs local demo mode

| | **Firebase — Read Only** (green badge) | **Demo / Local Simulation** (amber badge) |
| --- | --- | --- |
| Entered when | configured **and** `/m11` currently valid 50/50 | unconfigured, or `/m11` empty/incomplete/invalid |
| START | freezes the observed snapshot (instant, no generation) | runs local random generator (~1.6 s) |
| SHOW | progressive reveal of the frozen snapshot (500 ms/row) | same, of the generated round |
| Grid content | **identical to what APP 2 displays** | simulated, clearly labelled |

The badge (next to the status line) always shows the source of the round on
screen (or of the next START when none is held). Locally generated data is
never presented as Firebase data.

### Tests and results — 123/123 passed (13 files)

New/updated, mapping to the required list:

1. Valid snapshot → exact 50 cells: `m11Snapshot.test` mapper tests +
   `Console.live` "START/SHOW reveal EXACTLY the observed /m11 snapshot
   cells" (all 50 positions asserted against the delivered snapshot).
2. Live path never calls the generator: generator is mocked to **throw**;
   `Console.live` asserts `not.toHaveBeenCalled()` after a full live
   START/SHOW.
3. START/SHOW in live mode use the snapshot: same test — every cell equals
   the snapshot (`m1…m50`, '1'→safe / '0'→bomb).
4. Demo mode still works: existing `Console.test.tsx` (unconfigured) plus
   `Console.live` fallback test (invalid snapshot → generator used, amber
   badge).
5. Firebase remains read-only: unchanged permanent audit tests (import
   allowlist; no `.set/.update/.remove`; no transactions/onDisconnect).
6. No forbidden paths: unchanged path-guard tests.
7. No write APIs in production code: unchanged whole-`src` static-audit
   test.

Also: mid-reveal snapshot change → round frozen + hint shown; held-round
replacement on newer snapshot before SHOW.

### Gates

- typecheck (`tsc --noEmit`) ✅ 0 errors
- lint (`--max-warnings 0`) ✅ 0 problems
- full suite ✅ **123/123**
- production build ✅ 403.8 kB JS (106.6 kB gzip)

### Read-only / static audit (after the change)

- No `.set/.update/.remove/.runTransaction` in any service (grep clean).
- `onDisconnect` appears only inside the audit test's forbidden-list.
- `firebase/database` imports remain read-only (`onValue, ref, getDatabase`
  + types).
- `M11_PUBLISHING_ENABLED = false` (m11.ts:13).
- No forbidden path referenced; `.env` untracked & ignored; APKs and APP 2
  untouched; Firebase still never written (the fix only re-routes data
  **from** the existing read-only subscription).

### Git

- Commit **`7290168`** pushed to `origin/arena/01a0617d-apk-app`.
- Diff summary: 5 production files changed, 242 insertions(+), 34
  deletions(-), +2 test files (1 new), README updated.

**STOPPED after the fix as instructed — no publishing, no UI redesign.**

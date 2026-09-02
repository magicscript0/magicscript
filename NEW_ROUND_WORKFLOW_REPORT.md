# NEW ROUND WORKFLOW — DIAGNOSTIC & FIX REPORT

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `380aaed`
(`feat: add explicit new demo round action alongside live round load`) · **Pushed:** ✅

---

### Root cause

Phase 5A made the single START button **source-automatic**: whenever the
mirror reports a valid 50/50 `/m11` snapshot, `handleStart()` takes the
live-freeze branch and **early-returns** — the demo branch (and therefore
`generateDemoRound()`) became unreachable from the UI whenever live data
exists. The read-only config fix (`4956598`) then made live mode the
*normal* state, so a genuinely NEW local round could never be started.
Nothing was broken in the generator, the mirror, or the freeze logic — the
choice had simply been removed from the UI.

### Files changed (scope: 6 files, UI + tests + docs only)

| File | Change |
| --- | --- |
| `src/components/ActionButtons.tsx` | Single START replaced by three explicit controls: **LOAD LIVE ROUND** (emerald, disabled unless the live snapshot is valid, tooltip explains why), **NEW DEMO ROUND** (cyan, inherits the old START look/dice icon; shows "Preparing…" while generating), **SHOW** (unchanged) |
| `src/pages/Console.tsx` | `handleStart` split into `handleLoadLive` (existing freeze logic, verbatim) and `handleNewDemo` (existing demo branch, verbatim); status-line copy updated; no change to mirror effects or freeze semantics |
| `src/components/GameGrid.tsx` | Idle-overlay hint names the two actions |
| `src/pages/Console.test.tsx` | Queries updated to the new controls; + assertions (badge shows "Demo / Local Simulation"; LOAD LIVE ROUND disabled offline) |
| `src/pages/Console.live.test.tsx` | +4 new tests (below); live queries updated |
| `README.md` | Dual-action architecture documented |

**Untouched (verified 0 diff):** `m11Snapshot.ts`, `validation.ts`,
`config/game.ts` (m1…m50 mapping), `services/m11.ts`, `services/firebase.ts`,
all hooks, APKs, Firebase rules, `/m11` data.

### Exact behavior after the fix

- **LOAD LIVE ROUND** — enabled only when configured AND `/m11` valid
  50/50. Freezes the observed snapshot (instant, no generation, no Firebase
  interaction) → badge **"Firebase — Read Only"** (green) → SHOW reveals
  that exact frozen snapshot. Phase 5A semantics preserved: newer snapshot
  while held-but-not-shown replaces it wholesale; mid-reveal it stays
  frozen with a "Newer /m11 snapshot received" hint.
- **NEW DEMO ROUND** — always available (except mid-generate/mid-reveal).
  Runs the existing `generateDemoRound()` locally (~1.6 s) → badge
  **"Demo / Local Simulation"** (amber) → SHOW reveals the generated round.
  Completely independent from Firebase: a snapshot arriving mid-reveal
  never mutates it; starting another new demo round replaces the previous
  round wholesale; loading live replaces a held demo round wholesale. Never
  mixes cells from different rounds.
- SHOW/freeze/progress behavior and all Phase 5A guarantees unchanged.

### Tests — 127/127 passed (was 123; +4 net new, none removed/weakened)

Mapping to the required list:

1. Live load uses the exact observed snapshot — live test 1 (all 50 cells asserted) ✓
2. Live load never calls `generateDemoRound()` — generator mocked to throw ✓
3. NEW DEMO ROUND calls `generateDemoRound()` (even while live is valid) ✓ *(new)*
4. New demo round independent from Firebase (cells = mocked round, not the delivered snapshot) ✓ *(new)*
5. Demo labeled "Demo / Local Simulation" ✓
6. Firebase labeled "Firebase — Read Only" ✓
7. SHOW reveals the complete frozen demo round (offline suite, 50 cells, 18-safe curve) ✓
8. Firebase snapshot during demo reveal does not mutate the demo round ✓ *(new)*
9. A new demo round replaces the previous demo round completely ✓ *(new)*
   (+ LOAD LIVE replaces a held demo round completely ✓ *(new)*)
10. Firebase strictly read-only — permanent audit tests unchanged ✓
11. No forbidden write APIs introduced — import-allowlist + source-scan tests unchanged ✓
12. `/m11` validation & m1…m50 mapping unchanged — suites untouched & passing ✓

### Verification

- `npm run typecheck` ✅ 0 errors
- `npm run lint` (‑‑max‑warnings 0) ✅ 0 problems
- `npm test -- --run` ✅ **127/127**
- `npm run build` ✅ 405.2 kB JS (106.9 kB gzip)
- Static audit: no `.set/.update/.remove/.runTransaction`, no `onDisconnect`
  (outside the audit test's forbidden-list); `M11_PUBLISHING_ENABLED = false`;
  `firebase/database` imports read-only (`onValue/ref/getDatabase` + types);
  no forbidden paths; `.env` git-ignored & untracked; APKs 0 modifications.

**Live sync still works** (mirror effects untouched — live tests 1–6 pass),
**demo generation works** (offline + live fallback + new dual-action tests),
and the running dev preview serves the new controls.

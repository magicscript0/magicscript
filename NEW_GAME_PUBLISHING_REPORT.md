# NEW GAME PUBLISHING — IMPLEMENTATION & VERIFICATION REPORT

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `504cdbd`
(`feat: new game publishes validated round to firebase m11 atomically`) · **Pushed:** ✅

---

### 1. Root cause

Publishing never existed: every prior phase deliberately disabled writes
(`M11_PUBLISHING_ENABLED = false`, `publishDemoRound()` threw), and the UI's
"NEW DEMO ROUND" only produced a local round. The website could read `/m11`
but had no path to write it, so it could not replace APP 1's
generate-and-publish role.

### 2. Files modified

| File | Change |
| --- | --- |
| `src/services/m11.ts` | `publishDemoRound()` implemented: validates first (rejects before any SDK call), then **one atomic multi-path `update()`** of all 50 children at the fixed literal path `/m11`. `M11_PUBLISHING_ENABLED = true`. New `InvalidRoundError`. Read listener unchanged. |
| `src/types/game.ts` | `RoundPhase += 'publishing'`; `RoundSource += 'published'` |
| `src/pages/Console.tsx` | `handleNewGame`: generate **once** → validate → publish the **same node** → freeze the **same node** (`nodeToRows(candidate.node)`); staged statuses (Generating… / Validating… / Publishing… / success); on failure the previous confirmed round is kept, a clear error is shown, **no auto-retry**. Publish badge "Firebase — Published". |
| `src/components/ActionButtons.tsx` | **NEW GAME** button (disabled without Firebase, spinner while publishing); **LOAD LIVE ROUND** kept (read-only); **NEW DEMO ROUND** now offline-only fallback; SHOW kept |
| `src/components/GameGrid.tsx`, `MirrorPanel.tsx`, `ConsoleLayout.tsx` | Hint copy; publishing row now "NEW GAME only (guarded)"; footer updated |
| Tests | `m11.test.ts` (publishing + hardened static audit), `Console.live.test.tsx` (8 publish-flow tests), `Console.test.tsx` (offline never publishes), `MirrorPanel.test.tsx` |
| `README.md`, `.env.example` | Publishing architecture documented |

### 3. Publishing architecture

Client-side Firebase JS SDK (same RTDB instance the read mirror uses) —
**no server, no Admin credentials, no service-account keys in the browser**.
Configuration remains the single `VITE_FIREBASE_DATABASE_URL` (plus optional
passthroughs). The website writes exactly like the original APP 1 did:
unauthenticated, per the database's existing rules.

### 4. Atomicity — yes, one commit

The original APP 1 issued **50 sequential per-child writes** (audit-verified),
during which APP 2 could briefly observe a mixed old/new round. The new
implementation sends **one multi-path `update(ref(db,'m11'), {m1..m50})`**:
a single server-side commit. APP 2's `ChildEventListener` still receives its
per-child events (`onChildAdded`/`onChildChanged`) — unchanged — but now all
50 arrive from one commit, so a partial/mixed round is impossible. Each child
is written whole as `{ mN: "0"|"1" }` (strings), upsert-only, nothing
deleted, no other node touched.

### 5. Firebase Rules changes required

**None.** Evidence: APP 1 writes `/m11` unauthenticated today (audit-verified
behavior; the apps work), so the existing rules already permit client writes
to `/m11`. The rules JSON itself could not be read (no console access) —
stated as an inference from verified app behavior, not a direct read.

### 6. How the website creates a new game now

`NEW GAME` → **generate** (audited APP 1 curve 1,1,1,1,2,2,2,2,2,4 — 18
safe; unchanged) → **validate locally** (`validateM11Node`) → **publish**
(atomic update) → Firebase ack → **freeze the exact published object** →
`SHOW` reveals exactly those 50 values. UI states: Generating… → Validating…
→ Publishing… → "New game published successfully" or "Publish failed —
current round was not replaced." Badge: **Firebase — Published**.

### 7. APP 2 — not modified

Zero changes to APP 2, either APK, its listener, parsing, or package
(`git status` clean on both blobs). The write produces exactly the data APP
2 already expects.

### 8–11. Tests / typecheck / lint / build

- Tests ✅ **137/137** (was 129; publishing suites added, none removed):
  generator (50 cells, "0"/"1", curve, determinism) ✓ · validation ✓ ·
  NEW GAME publishes once, only after validation ✓ · publish payload is
  contract-valid and **object-identical** to what SHOW reveals (`toBe`) ✓ ·
  LOAD LIVE / SHOW / render / listener never publish ✓ · publish failure
  keeps the previous confirmed round, exactly one attempt ✓ · snapshot
  mid-published-reveal never mutates the frozen round ✓ · second NEW GAME
  replaces fully ✓ · offline mode never publishes ✓ · read-only and
  forbidden-path audits ✓.
- typecheck ✅ 0 errors · lint ✅ 0 problems · build ✅ 411.8 kB JS
  (108.6 kB gzip).

### 12. Static Firebase write audit

Sweep of all production code: **exactly one write API exists** —
`update(nodeRef, node)` at `src/services/m11.ts:106` (plus its doc comment).
`generator.ts`'s `.set(` is a local JS `Map.set` (file imports nothing from
Firebase — asserted by tests). **No** `set()`, `remove()`, `runTransaction`,
`onDisconnect`, `fetch()`, XHR, or REST POST/PUT/PATCH anywhere in
production. No forbidden path. `.env` untracked; APKs/rules untouched.
This audit is permanently enforced by the test suite.

### 13. End-to-end verification

- **Baseline captured** immediately before implementation: `/m11` =
  unchanged Phase-4 round (20 safe; rows 8–9 = 3 safe).
- **Verified in-code (mocked SDK + jsdom):** the full chain NEW GAME →
  generate → validate → single atomic update at `/m11` with the exact
  contract payload → freeze → SHOW reveals the identical object → repeat
  works; APP 2 compatibility follows from the payload being byte-shaped
  exactly like APP 1's (same validator, same wrapper structure, same
  child-event semantics).
- **Live write could not be executed from this sandbox** — its egress proxy
  blocks all Google endpoints (established in Phase 4), so the real write
  must come from a browser. The dev preview is running the new build with
  the real database URL: **open the preview, log in (any ID +
  `demo-access`), click NEW GAME** — the status will run Generating →
  Validating → Publishing → "New game published successfully", the badge
  shows "Firebase — Published", and `/m11` will change.

### 14. Remaining manual step (5 minutes)

1. Preview → login → **NEW GAME** → expect "New game published successfully".
2. Open APP 2 → open a game → it should show the new 18-apple round
   (recognizable: rows 8–9 now have exactly 2 safe cells, unlike the old
   3-and-3 round; row 10 has 4).
3. **SHOW** on the website → all 50 cells must match APP 2.
4. Click **NEW GAME** again → APP 2 updates again.
5. If you tell me when you've clicked, I can re-read `/m11` and confirm the
   published payload from here (read-only).

**APP 2 was not modified. No rules were changed. The only Firebase write in
the codebase is the guarded NEW GAME publish.**

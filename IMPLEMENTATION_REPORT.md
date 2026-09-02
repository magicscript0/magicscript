# PHASE 2 — IMPLEMENTATION REPORT

**Project:** Apple Console — DEMO web replacement for the original Android
operator app ("APP 1")
**Branch:** `arena/01a0617d-apk-app` · **Commits:** `8e14f48` (feat),
`a362519` (docs), `dd35c91` (dev-server host fix)
**Status:** COMPLETE — all verification gates passed. STOPPED at the phase
boundary as instructed (no Firebase writes, no publishing).

---

## 1. What was built

A polished, standalone **Vite + React 18 + TypeScript + Tailwind CSS 3 SPA**
(`apple-demo-console`) reproducing APP 1's operator workflow: login gate →
console with header, 10×5 apple grid, multiplier ladder, START / SHOW.
No backend server; Firebase JS SDK (RTDB-only) integrated but **read-only**.

## 2. Screen 1 — Login (demo gate)

- Accepts **any non-empty operator ID** (≤ 40 chars, trimmed; validated with
  friendly errors for empty / whitespace / too-long).
- Passcode comes from `VITE_DEMO_PASSWORD` (default `demo-access`).
  The original Android password **"MAGIC" is nowhere in runtime source** —
  enforced by a unit test that scans the gate file and asserts rejection.
- States implemented: idle, empty-ID error, missing-password error,
  wrong-password error (~1.1 s simulated check with spinner), success.
- ID persisted in `sessionStorage` only; **no passwords ever stored in any
  web storage** (test-verified). Persistent DEMO notices on the screen.

## 3. Screen 2 — Console

- **Header:** brand, operator ID chip, "ONLINE USERS" counter
  (**simulated** 20–600, refreshes every 2 s — no presence system), DB
  status pill, logout.
- **Grid:** 10×5 (m1–m50), row 10 (×349.68) top → row 1 (×1.23) bottom;
  cell states empty → hidden → safe ("1", apple) / bomb ("0"); pop-in
  animation on reveal; ≥ 44 px touch targets; display-only like the original.
- **Multiplier ladder:** all 10 rungs (1.23, 1.54, 1.93, 2.41, 4.02, 6.71,
  11.18, 27.97, 69.93, 349.68) rendered inline per row **from the single
  typed config** (`ROWS` in `src/config/game.ts`) — no duplicated literals
  (test-verified).
- **START:** disabled during generation → ~1.6 s simulated loader with
  rotating messages → generates + validates a 50-position round **locally**,
  held in React state only. **SHOW:** disabled until a round exists
  (test-verified) → row-by-row progressive reveal (500 ms/row; 80 ms under
  `prefers-reduced-motion`), round immutable during reveal (test-verified),
  progress bar + "N of 10 revealed" + final "18 safe cells" chip.

## 4. Generator (`src/utils/generator.ts`)

Deterministic seeded PRNG (mulberry32) + partial Fisher–Yates placement.
Curve per row exactly **1, 1, 1, 1, 2, 2, 2, 2, 2, 4** safe cells (18 total);
row N owns keys m(5N−4)…m(5N). Output shape is the exact contract wrapper
`{ mN: { mN: "0" | "1" } }` with **string** values only. Every round is
run through `validateM11Node` **before** it can be displayed. Isolated pure
module — no React, no Firebase imports.

## 5. Validation (`src/utils/validation.ts`)

Accepts only: object with **exactly** the 50 keys, each child an object with
**exactly one** entry whose key equals the child name, value strictly the
string `"0"` or `"1"`. Rejects missing keys, extra keys, mismatched inner
keys, multi-entry wrappers, numbers/booleans/null, non-object roots — each
with a precise error message.

## 6. Firebase boundary — WRITES DISABLED

- `src/services/m11.ts` is the **single** write path, gated by
  `M11_PUBLISHING_ENABLED = false` → `publishDemoRound()` **always throws
  before touching the SDK** (test-verified). Future implementation is
  contract-exact: 50 per-child `update()` upserts, never `set`/`remove`
  (a source-scan test forbids those calls).
- Path guard `assertM11ChildPath()` allows only `/m11/m1 … /m11/m50` and
  hard-rejects the forbidden nodes `/main /xbetmoney /users /bet1 /data`
  (test-verified).
- Read-only live mirror (`subscribeToM11`) uses **child_added /
  child_changed** — the same events APP 2 listens to. Attaches only when
  `.env` is configured; with no `VITE_FIREBASE_API_KEY` the app runs in
  **offline demo mode** with zero Firebase network activity.
- Config comes **only** from the 7 `VITE_FIREBASE_*` env vars; nothing
  hardcoded (built bundle contains no project URL — grep-verified).

## 7. Secrets hygiene

`.env` is git-ignored (`git check-ignore` verified); **no `.env` file exists**
in the repo — only `.env.example` with placeholders. No credentials in
source, no stack traces or env values rendered in the UI (friendly messages
only, incl. an ErrorBoundary).

## 8. Untouched assets

`base.apk`, `1xbet_1.0.apk` and APP 2: **zero modifications** (`git status`
clean on both blobs). No Firebase data, rules, or security settings were
touched. **No Firebase calls were executed at any point** in this phase.

## 9. Test suite (spec §17) — 60 tests, 7 files, ALL PASSING

- **Generator (11):** 50 cells / all keys present; exact curve per row;
  string values only; wrapper shape; determinism; seed variation; PRNG
  range/stability; uniform column coverage over 200 seeds; row→key mapping.
- **Validation (15):** accepts valid; rejects missing key(s), empty object,
  non-objects, malformed wrappers, invalid values (1/0/true/"2"/""/null),
  mismatched inner key, multi-entry child, extra keys; multi-error collection.
- **UI (13):** login renders; empty/whitespace ID rejected; password
  required; wrong password rejected + retry; success passes trimmed ID;
  nothing stored in web storage; operator ID shown; SHOW disabled pre-START;
  START enables SHOW + renders 50 cells; row-by-row reveal; per-tick reveal;
  round stability during reveal; second round resets; logout; 10 rungs.
- **Service/gate (15 + 6):** publishing disabled + refuses; no set/remove in
  source; path guard accepts exactly the 50 paths, rejects all forbidden /
  unknown / nested paths; env passcode honored; whitespace fallback; "MAGIC"
  never accepted and never hardcoded.

## 10. Verification gates — ALL PASSED

| Gate                | Command             | Result                          |
| ------------------- | ------------------- | ------------------------------- |
| Typecheck           | `tsc --noEmit` (strict) | ✅ 0 errors                  |
| Lint                | `eslint --max-warnings 0` | ✅ 0 problems              |
| Tests               | `vitest run`        | ✅ 60/60 passed                 |
| Production build    | `tsc --noEmit && vite build` | ✅ 398 kB JS (105 kB gzip) |

## 11. Accessibility & UX polish (spec §18)

Dark theme with glow/elevation system; visible focus rings; ≥44 px targets;
`prefers-reduced-motion` respected in **both** JS timings and CSS;
persistent unmissable demo banner on every screen; layout-stable grid
(empty state overlay instead of unmount); header wraps on mobile;
row/multiplier always aligned; friendly error surface for generator
failures; footer states the phase boundary.

## 12. How to run

```bash
npm install
npm run dev        # http://localhost:5173 (any ID + "demo-access")
npm test           # 60 tests
npm run build      # type-check + production bundle
```

Optional read-only live mirror: copy `.env.example` → `.env`, fill the demo
project values (apiKey + databaseURL + projectId required). Publishing
remains disabled regardless.

## 13. Deliberately NOT included

Real authentication; presence system; real-money/betting/1xBet integration
(any flavor); deposits/payments/withdrawals; writing to `/main`, `/xbetmoney`,
`/users`, `/bet1`, `/data`; deletes of any kind; publishing rounds to
Firebase; any modification of APP 2 or the APKs.

## 14. Next step (requires explicit approval)

A future phase can enable publishing by flipping `M11_PUBLISHING_ENABLED`
in `src/services/m11.ts` and wiring a "Publish" action — the guarded
service, path allowlist, contract validator, and generator are already in
place and tested. **Nothing will be published until you explicitly approve
it.**

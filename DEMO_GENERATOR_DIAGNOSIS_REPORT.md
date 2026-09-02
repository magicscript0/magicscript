# DEMO GENERATOR DIAGNOSIS REPORT

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `9434d11`
(`test: prove demo generator matches audited app1 algorithm cell for cell`) · **Pushed:** ✅

---

### Exact root cause (of the perceived mismatch)

**The generator is not broken.** The mismatch you see is a **data-vs-algorithm
difference**: the current live `/m11` round was **not produced by APP 1's
audited algorithm**.

- Fresh read-only read of `/m11` (this diagnosis): **byte-identical** to the
  Phase-4 snapshot — rows 8–9 carry **3** safe cells each (20 apples total).
- The Phase-1 audit (finding **F4**, smali-verified incl. bytecode `if-ne
  v0, 4`) proves APP 1's `_sf1.._sf10` can **only** produce: rows 1–4
  exactly **1**, rows 5–9 exactly **2**, row 10 exactly **4** — i.e. the
  curve `1,1,1,1,2,2,2,2,2,4` (18 apples). A round with 3 safe cells in
  rows 8–9 is impossible under that algorithm — it was created/edited by
  something else (hand-edit or a different publisher version).
- Therefore `NEW DEMO ROUND` rounds show **18 apples (2 in rows 8–9)** while
  the round you've been watching in APP 2 shows **20 (3 in rows 8–9)** —
  that's the visible "pattern doesn't look right". Per your instruction the
  repo-documented curve is preserved (the repo's verified audit defines it);
  the demo generator was **not** altered to copy Firebase data.

### Inspection checklist (all seven questions)

1. **Safe cells per row:** exactly `1,1,1,1,2,2,2,2,2,4` — verified at
   runtime across **5,000/5,000** seeds (see example below).
2. **Guaranteed counts:** yes — structural, not probabilistic
   (`pickDistinctIndexes` partial Fisher–Yates picks exactly `safeCells`
   distinct columns per row; validated before display).
3. **m1…m50 ordering:** identical to the live path — both go through the
   same typed `ROWS` config (m1–m5→row 1 … m46–m50→row 10). New parity
   test proves `liveValuesToRows(evaluate(generated)) === nodeToRows(generated)`.
4. **`"1"`=safe / `"0"`=bomb:** consistent everywhere (generator, validator,
   grid rendering, audit contract `"1"`=WIN/poi, `"0"`=lose/appleoff).
5. **Seed/randomization:** mulberry32, deterministic per seed, different
   seeds → different rounds; measured column placement over 5,000 rounds is
   uniform (no bias, no clustering) — e.g. row 1 columns: 996/1005/1007/983/1009.
6. **UI vs generation:** the UI reveals correctly — proven by a new
   cell-exact test (SHOW output equals the generated round for the seed
   displayed in the UI); the bug is not in the UI.
7. **Vs documented rules:** generator matches the repo's documented rules
   exactly (README curve + Phase-1 audit F4 + code comments all agree).

### Example generated distribution (seed 1, 🍎 = safe)

```
row 10 🍎 🍎 🍎 🍎 ·      row 5  · · 🍎 · 🍎
row  9 🍎 · 🍎 · ·      row 4  · · · · 🍎
row  8 🍎 · 🍎 · ·      row 3  · · 🍎 · ·
row  7 · · 🍎 · 🍎      row 2  🍎 · · · ·
row  6 🍎 · · 🍎 ·      row 1  · · · 🍎 ·
```

Per-row safe counts: `1,1,1,1,2,2,2,2,2,4` — total **18**.

### Files changed (tests + docs only — zero production code)

| File | Change |
| --- | --- |
| `src/utils/generator.test.ts` | + parity test: generated round is indistinguishable from a live snapshot (same validator status, 50/50, same row mapping via `liveValuesToRows === nodeToRows`) |
| `src/pages/Console.test.tsx` | + cell-exact test: SHOW reveals **exactly** the generated round (seed parsed from the UI, expected round rebuilt with the real generator, all 50 cells asserted) |
| `README.md` | Documented that the curve is the smali-verified APP-1 algorithm (18 safe) and that live rounds may legitimately differ if created outside it |

`generator.ts`, `game.ts`, `m11Snapshot.ts`, `validation.ts`, services,
hooks, `Console.tsx`, components: **0 changes** (verified via git diff).

### Tests — 129/129 passed (+2, none removed/weakened)

Required matrix coverage: 50 cells ✓ · values `"0"`/`"1"` only ✓ · exact
per-row curve ✓ · deterministic per seed ✓ · different seeds differ ✓ ·
m1…m50 ordering ✓ · SHOW reveals exactly the generated round ✓ (new) ·
NEW DEMO ROUND independent from Firebase ✓ (live suite) · Firebase strictly
read-only ✓ (permanent audit tests).

### Build / verification

- `npm run typecheck` ✅ 0 errors · `npm run lint` ✅ 0 problems
- `npm test -- --run` ✅ **129/129** · `npm run build` ✅ 405.2 kB (106.9 gzip)

### Firebase read-only audit

No write APIs in production code (`.set/.update/.remove/.runTransaction`
absent; `onDisconnect` only in the audit test's forbidden-list) ·
`M11_PUBLISHING_ENABLED = false` · only `/m11` observed, no forbidden paths ·
`.env` git-ignored & untracked · APKs & rules untouched · the one Firebase
interaction during this diagnosis was a single read-only REST GET.

### If you WANT the demo to mimic the observed live pattern

That would be a deliberate rule change (rows 8–9 → 3 safe each, 20 total) —
explicitly not done, per your instruction to preserve the repo-documented
curve. It remains a one-line change (`safeCells` in `src/config/game.ts`)
awaiting your explicit approval.

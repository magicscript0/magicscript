# PHASE 3 — IMPLEMENTATION REPORT
## Firebase Read-Only Integration

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `cbdb96b`
(`feat: add readonly firebase demo sync`)
**Status:** COMPLETE — strictly read-only. Publishing remains disabled.

---

### 1. Files changed

| File | Change |
| --- | --- |
| `src/utils/validation.ts` | Extracted shared per-child validator `validateM11Child()` (same error messages; whole-node validator now delegates to it) |
| `src/utils/m11Snapshot.ts` | **NEW** — pure `evaluateM11Snapshot()`: classifies a raw `/m11` snapshot as `empty / invalid / incomplete / valid` with per-key missing/invalid lists, observed values, safe count |
| `src/services/m11.ts` | Read-only listener rewritten to a single `onValue` on the fixed path `/m11`; `publishDemoRound()` hardened — it now contains **no SDK write call at all** and always throws; publishing flag unchanged |
| `src/hooks/useM11Mirror.ts` | Full sync lifecycle: `idle → syncing → empty/incomplete/invalid/valid | error` |
| `src/components/MirrorPanel.tsx` | DB status panel now shows connection state + `/m11` sync state + last update + explicit non-destructive warnings |
| `src/components/ConnectionPill.tsx | "Not configured · offline demo" label |
| `src/types/game.ts` | Removed now-unused `M11Snapshot` type |
| `src/pages/Console.test.tsx` | Mocks the Firebase service → deterministic offline tests regardless of local `.env` |
| Tests (below) | 6 new/extended suites |
| `README.md` | Documented the two modes and all sync states |

### 2. Firebase initialization details

- Configuration read **only** from the existing `VITE_FIREBASE_*` variables
  (7 names from `src/config/firebase.ts`); required: `apiKey`,
  `databaseURL`, `projectId` — whitespace-only counts as missing.
- `getDemoDatabase()` initializes lazily **only when the configuration is
  complete**; otherwise it throws `FirebaseNotConfiguredError` with a
  friendly `.env.example` hint (no values leaked). With no `.env` the app
  stays in offline demo mode and **zero** Firebase calls occur.
- No `.env` exists in the repo; `.env.example` carries placeholders only.

### 3. Read-only listener details

- `subscribeToM11Sync()` attaches **one `onValue` listener** to the fixed
  literal path `/m11` (never user-controlled). It observes `m1`–`m50`.
- Every snapshot is validated by the pure evaluator against the frozen
  contract `{ mN: { mN: "0" | "1" } }` — string values only.
- Empty, incomplete, or malformed data is **reported, never repaired**:
  no defaults, no initialization, no overwrite, no deletes. Extra unknown
  keys are ignored (same tolerance as the Android client).
- A connection probe (`.info/connected`) drives the status pill; both
  subscriptions are cleaned up on unmount.
- The generator is untouched and fully functional with or without Firebase.

### 4. Connection-state behavior

| State | Trigger | UI |
| --- | --- | --- |
| Not configured | missing `.env` | pill + panel "Not configured (offline demo mode)" |
| Connecting | configured, probe pending | pill "DB connecting…", panel "Connecting…" |
| Connected | `.info/connected === true` | "Connected (read-only)" |
| Disconnected | probe went false | "Disconnected" |
| Error | probe/listener failure or attach throw | "DB error" / "Connection error" + friendly message |

`/m11` sync states shown alongside: **Syncing… / Empty / Incomplete (N/50,
keys listed) / Invalid data (keys listed) / In sync (50/50 valid + safe/bomb
counts)**. Warnings use `role="alert"` and always state that nothing is
created, repaired, or overwritten; while still connecting, an empty node
shows an informational "waiting for connection" message instead of an alarm.

### 5. Tests and results — 114/114 passed (12 files)

- **Config detection (9):** missing/partial/whitespace configs → null;
  full config passthrough; `getDemoDatabase` refuses without config; error
  message leaks no values.
- **Snapshot evaluation (17):** valid node (50/50, safe counts); generated
  rounds always valid; extras ignored; empty (null/{}/array/string/number);
  missing keys listed exactly; no invented values; invalid numerics,
  booleans, illegal strings, bare values, mismatched inner keys, multi-entry
  wrappers; invalid+missing combined; safe-count integrity.
- **Connection hook (6):** unconfigured never subscribes; connecting →
  connected → disconnected → error; attach-throw → error; unsubscribes.
- **Mirror hook (6):** idle never subscribes; syncing → first snapshot;
  all four sync states propagate; listener error; unsubscribe on unmount.
- **MirrorPanel (14):** all 5 connection labels; publishing disabled;
  idle/syncing/empty(+waiting variant)/incomplete/invalid/valid/error
  renderings incl. non-destructive wording.
- **Static-audit test (in `m11.test.ts`):** scans **every** production file —
  `firebase/database` imports limited to a read-API allowlist
  (`onValue, get, getDatabase, ref, query, types…`); no `runTransaction`,
  no `onDisconnect`; services contain no `.set(/.update(/.remove(`.
- Phase 2 suites (generator, validation, login, console, gate) all still green.

### 6. Build result

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (strict) | ✅ 0 errors |
| `eslint --max-warnings 0` | ✅ 0 problems |
| `vitest run` | ✅ 114/114 |
| `vite build` | ✅ 400.9 kB JS (105.8 kB gzip), built in ~3 s |

### 7. Git commit hash

**`cbdb96b`** — `feat: add readonly firebase demo sync`, pushed to
`origin/arena/01a0617d-apk-app`.

### 8. Confirmation that Firebase data was not modified

- **No Firebase connection was ever opened from this environment** (no
  `.env` with credentials exists here), so no read or write request of any
  kind reached the database during development/testing.
- Statically proven (and permanently enforced by a unit test): the codebase
  contains **zero** Firebase write API calls — `publishDemoRound()` always
  throws before (and without) any SDK interaction.
- `M11_PUBLISHING_ENABLED = false` (verified: `src/services/m11.ts:13`).
- No forbidden path (`/main`, `/xbetmoney`, `/users`, `/bet1`, `/data`)
  is referenced anywhere outside the guard constants/tests.
- No security rules were touched — the repo contains no rules file and no
  console access was attempted.
- Neither APK was modified (`git status` clean on both blobs); APP 2 untouched.

### 9. Issues discovered

1. **Live connection could not be verified from this sandbox** — no Firebase
   credentials were provided (`.env.example` has an empty `apiKey` by
   design). The listener logic is therefore verified by unit tests with a
   mocked SDK, not against the live `zaem-a8d30` database. To try it for
   real: create `.env` with the three required values and the panel will
   show Connecting → Connected (read-only) → the actual `/m11` sync state.
2. **Child-event listener replaced by `onValue`** — Phase 2 attached
   `child_added`/`child_changed` (parity with APP 2). That design cannot
   detect "empty or incomplete" reliably (no completion signal), so Phase 3
   uses a single read-only `onValue` on `/m11`, which reports the whole node
   per event and makes completeness verification exact. Read-only semantics
   are identical; nothing about the write contract changed.
3. **Removed the disabled write sketch** — Phase 2's `publishDemoRound()`
   contained commented-ready `update()` calls behind the flag. Phase 3
   removes them entirely (the function always throws), so "no write API
   anywhere" is now literally true of the source, not just the runtime path.
4. Minor: `generator.ts` uses a local JavaScript `Map.set()` — flagged by
   the raw grep audit, confirmed unrelated to Firebase (the file has no
   Firebase imports); the enforceable test uses the import allowlist instead.

**Publishing remains disabled. STOPPED as instructed.**

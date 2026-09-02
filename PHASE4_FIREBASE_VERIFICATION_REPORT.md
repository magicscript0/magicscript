# PHASE 4 — FIREBASE VERIFICATION REPORT
## Real Read-Only Connection to the Demo Database

**Branch:** `arena/01a0617d-apk-app` · **Date:** 2026-09-02
**Mode:** STRICTLY READ-ONLY — publishing remains disabled.

---

### 1. Firebase project detected

**`zaem-a8d30`** — Realtime Database
`https://zaem-a8d30-default-rtdb.firebaseio.com`. Matches the Phase-1/2
audit exactly (RTDB URL + web API key embedded in both APKs at resources
`0x7f10003b` / `0x7f10003c`).

### 2. Environment configuration status

- No `.env` existed, so the required values were **recovered from the
  demo APKs' own embedded client config** (the exact values the audit
  identified — nothing invented): extracted `firebase_database_url` and
  the API key directly from `resources.arsc` of both APKs. Both APKs carry
  the identical database URL; each carries its own platform API key
  (39 chars, `AIza…` — the APP 1 key was used).
- Local `.env` created with 4 variables: `VITE_FIREBASE_API_KEY`,
  `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`. Values are **redacted from all output**
  in this report; the key was only ever written to the git-ignored `.env`.
- `git check-ignore .env` ✓ — never staged, never committed
  (`git ls-files` confirms). `.env.example` needed **no changes**.
- Dev server restarted so Vite loaded the env; the served app module was
  verified to carry the config (API key + databaseURL present in the
  transformed module — key masked in the terminal output).

### 3. Connection status

- **Sandbox network limitation (disclosed):** this workspace's egress is
  allow-listed at the TLS layer — `api.github.com`/`pypi.org` respond 200,
  while all Google endpoints (`firebaseio.com`, `google.com`) fail the TLS
  handshake (`SSL_ERROR_SYSCALL`). A websocket/SDK session **from the
  sandbox** therefore **could not be verified**.
- **Ground truth was still obtained, read-only**, through the platform's
  unrestricted page reader performing the equivalent REST read:
  `GET https://zaem-a8d30-default-rtdb.firebaseio.com/m11.json` →
  **HTTP success, full JSON payload** (§4–§8 below). No `?auth=`/key was
  needed — the node is **publicly readable**, consistent with the Android
  client reading it without any sign-in.
- **Browser path:** the app's Firebase SDK runs client-side in the browser,
  not in the sandbox. The dev server now serves the app **in configured
  mode**; opening the live preview and logging in (any ID +
  `demo-access`) will show the pill **"DB connected · read-only"** and the
  panel **"/m11 — In sync · 50/50 keys valid"**. The connection-state
  machine itself (Connecting → Connected/Disconnected/Error) is covered by
  the Phase-3 unit tests (mocked SDK).

### 4. `/m11` status

**VALID** — publicly readable, complete, contract-conforming round data.

### 5. Number of observed keys

**50 / 50** — exactly `m1` … `m50`, no extras.

### 6. Validation result

The **app's own validator** (`evaluateM11Snapshot` from
`src/utils/m11Snapshot.ts`, bundled and run on the fetched snapshot)
returned:

```
status   : valid
present  : 50/50
missing  : none
invalid  : none
safe("1"): 20   bomb("0"): 30
per-row safe cells (rows 1→10): 1,1,1,1,2,2,2,3,3,4
```

### 7. Missing / invalid keys

**None.** All 50 children are single-entry objects whose inner key equals
the child name, with string values only.

### 8. Android-compatible structure observed

**YES — confirmed against the documented APP 2 contract:**

| Contract requirement | Observed |
| --- | --- |
| children exactly `m1`…`m50` | ✓ all 50, no extras |
| child shape `{ mN: { mN: … } }` | ✓ every child single-entry, self-keyed |
| values are the STRINGS `"0"`/`"1"` | ✓ (no numbers/booleans) |

Observed row curve `1,1,1,1,2,2,2,3,3,4` (20 safe) differs slightly from
our demo generator's curve (rows 8–9 carry 3 safe cells instead of 2) —
**recorded as an observation only**; this is pre-existing data written by
the original operator app (our app has never written anything). Nothing was
changed to make anything pass.

### 9. Tests

- `tsc --noEmit` ✅ 0 errors · `eslint --max-warnings 0` ✅ 0 problems
- `vitest run` ✅ **114/114 passed** (no tests weakened or removed)

### 10. Build

Production build ✅ `401.12 kB` JS (`105.90 kB` gzip) + `23.87 kB` CSS,
built in ~3 s.

### 11. Security audit

- `M11_PUBLISHING_ENABLED = false` — confirmed (`src/services/m11.ts:13`).
- No Firebase write API exists in production code (import-allowlist test +
  grep sweep: no `.set/.update/.remove`, no transactions, no disconnect
  writes).
- The only database operation performed during this phase was **one REST
  GET of `/m11.json`** (read). No forbidden path (`/main`, `/xbetmoney`,
  `/users`, `/bet1`, `/data`) was accessed — not even read.
- No security rules were modified (no rules access of any kind).
- `.env` is git-ignored and untracked; no credentials in the report, UI, or
  commit history. APK blobs unmodified (`git diff` clean on both).

### 12. Git changes / commit

**No code changes were required** — Phase 3 already contained the full
read-only implementation, so per instructions **no feature commit** was
created. The only commit is this report (docs-only, titled
"docs: add phase 4 firebase verification report"). `.env` remains local-only.

### 13. Confirmation that Firebase data was NOT modified

**Explicitly confirmed: Firebase data was NOT modified.**
The single network interaction with the database in this phase was one
read-only GET of `/m11.json`. The codebase contains no write path
(statically audited and permanently test-enforced), publishing is disabled,
and no repair/initialization/overwrite/delete of `/m11` (or any node) was
performed or attempted.

**STOPPED as instructed — not proceeding to Firebase publishing.**

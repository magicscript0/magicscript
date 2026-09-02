# READ-ONLY CONFIG DIAGNOSTIC & FIX REPORT

**Branch:** `arena/01a0617d-apk-app` · **Commit:** `4956598`
(`fix: require only database url for readonly firebase config`)

---

### Exact root cause

The web app was NOT blocked by Firebase — it was blocked by **our own
configuration guard**. `readFirebaseConfigFromEnv()` in
`src/services/firebase.ts` demanded **three** non-empty values
(`VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_DATABASE_URL` +
`VITE_FIREBASE_PROJECT_ID`) before it would initialize anything
(`REQUIRED_FIREBASE_ENV` in `src/config/firebase.ts` listed all three).

With no Firebase Console access, no Web-App API key could be filled in, so
a copied `.env.example` (URL prefilled, apiKey empty) was rejected →
`isFirebaseConfigured() === false` → the read-only listener never attached
→ the UI showed "Not configured · offline demo" / "Not attached" → the
Phase 5A live mirror could never engage, leaving only the local generator.

### Is the API key actually required?

**No — not for this architecture.** Two independent proofs:

1. **SDK/architecture:** the Firebase JS SDK's Realtime Database connection
   is made to the instance named in `databaseURL` (websocket to
   `<instance>.firebaseio.com/.ws`); an API key is a project identifier
   used by Auth/Firestore/Analytics-style services and is **not part of the
   RTDB wire protocol**. `initializeApp({ databaseURL })` is a supported
   minimal initialization for RTDB-only usage; access is then decided by
   the database's security rules.
2. **Rules (Phase 4, empirical):** `GET
   https://zaem-a8d30-default-rtdb.firebaseio.com/m11.json` succeeded
   **completely unauthenticated** (no `?auth=`, no key) and returned the
   full 50-key round. Public read rules ⇒ a keyless SDK read of `/m11` is
   permitted.

`projectId`/`authDomain`/`storageBucket`/`messagingSenderId`/`appId` are
likewise not needed for RTDB — they remain **optional passthroughs**,
passed to the SDK only when present. Nothing was invented; no requirement
was bypassed blindly.

*Limitation (disclosed):* a live SDK websocket could not be exercised from
this sandbox (its egress proxy blocks Google endpoints), so the keyless
claim rests on the SDK's documented RTDB behavior + the Phase 4
unauthenticated REST proof, and is now running in the served preview for
real-world confirmation.

### Exact files changed

| File | Change |
| --- | --- |
| `src/config/firebase.ts` | `REQUIRED_FIREBASE_ENV` reduced to `[…databaseURL]`, with rationale comment |
| `src/services/firebase.ts` | Guard requires only a valid `databaseURL`; added `isValidDatabaseUrl()` (https + `*.firebaseio.com` / `*.firebasedatabase.app` — never points the SDK at an arbitrary host); `initializeApp({ databaseURL, …optionalPresent })` (empty strings dropped); error message names the single required variable |
| `src/config/firebase.test.ts` | Required-list assertion updated |
| `src/services/firebase.test.ts` | Detection suite rewritten for URL-only semantics (+ URL-shape rejection tests) |
| `src/components/MirrorPanel.tsx` | Offline note: "only the database URL is required (no API key…)" |
| `.env.example` / `README.md` | Document that copying `.env.example` as-is enables the read-only mirror |

**Not touched:** `/m11` validation, m1…m50 mapping, generator,
`services/m11.ts`, both APKs, APP 2, Firebase rules — `git diff` shows 0
changes across all of them.

### Exact configuration now required

```
VITE_FIREBASE_DATABASE_URL=https://zaem-a8d30-default-rtdb.firebaseio.com
```

That is the **only** required variable (unchanged URL, as mandated). All
other `VITE_FIREBASE_*` values are optional. The sandbox's local `.env`
now contains **exactly this one line** — the previously extracted API key
was removed from disk entirely, so the running preview itself proves the
keyless path.

### Data flow achieved

```
APP 1 → Firebase /m11 → APP 2
                    ↘ Web App (read-only onValue → evaluator → Console)
```

With the URL set, the mirror attaches, and (per Phase 5A) a valid 50/50
snapshot makes START/SHOW display **exactly** what APP 2 displays
("Firebase — Read Only" badge). Local generator remains only as fallback
when Firebase is unreachable/invalid ("Demo / Local Simulation" badge).

### Tests / typecheck / lint / build

- typecheck (`tsc --noEmit`, strict) ✅ 0 errors
- lint (`--max-warnings 0`) ✅ 0 problems
- full suite ✅ **123/123** (config tests now prove: URL-only ⇒ configured;
  apiKey-without-URL ⇒ not configured; malformed/hostile URLs rejected;
  init guard still throws without a URL; all prior suites unchanged)
- production build ✅ 403.9 kB JS (106.6 kB gzip)

### Static read-only audit

- No `.set/.update/.remove/.runTransaction` in production code ✓
- No `onDisconnect` outside the audit test's forbidden-list ✓
- `M11_PUBLISHING_ENABLED = false` (`services/m11.ts:13`) ✓
- No forbidden path (`/main /xbetmoney /users /bet1 /data`) referenced
  outside the guard constants ✓ · only `/m11` is ever observed ✓
- `.env` git-ignored & untracked; `.env.example` contains no secrets ✓
- APKs unmodified; Firebase rules unmodified; no repair/init/overwrite/
  delete behavior added ✓
- Served app verified: databaseURL injected, **zero** API key in the
  bundle ✓

### Commit

**`4956598`** — pushed to `origin/arena/01a0617d-apk-app`.

**STOPPED after this diagnostic/fix — no UI redesign, no publishing.**

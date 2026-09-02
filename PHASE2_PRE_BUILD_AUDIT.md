# PHASE 2 PRE-BUILD AUDIT — WEB DEMO REPLACEMENT FOR APP 1

**Date:** 2026-09-02 · **Repo:** `saifselme7/apk-app` · **Audited state:** local branch `arena/01a0617d-apk-app` + `origin/main @ 7f4d45d`
**Scope acknowledged:** standalone **DEMO / simulation only** — no real betting/gambling/wagering integration, no real-money payments. Firebase = demo backend only. Existing demo Firebase data contract must be preserved. **No Firebase data modified, no features implemented in this phase — audit only, then STOP for approval.**

---

## 1. REPOSITORY STRUCTURE (verified — complete file inventory)

```
saifselme7/apk-app
├── .git/                          (git metadata; history: 3 commits, no other files ever committed)
├── .gitattributes                 (0 bytes — emptied at origin/main; no LFS rules remain)
├── base.apk                       (10,471,317 B — APP 1, the Android operator app this demo replaces)
├── 1xbet_1.0.apk                  (86,593,521 B — APP 2, the demo Android player/client that observes /m11)
├── PHASE1_AUDIT_REPORT.md         (untracked — full APP 1 forensic audit)
└── COMPLETE_TWO_APP_AUDIT.md      (untracked — full two-app compatibility audit + verified /m11 contract)
```

Verified via `git log --all --name-only`: no other file has ever existed in any branch. **There is no web project in this repository.**

### Relevant files (what each is FOR)

| File | Role in this project |
|---|---|
| `base.apk` | Source of truth for the behavior being recreated (operator console: generate 10×5 grid → publish 50 values → progressive reveal). Fully reverse-engineered in `PHASE1_AUDIT_REPORT.md`. |
| `1xbet_1.0.apk` | The demo Android **consumer** whose observation requirements define the compatibility contract. Fully reverse-engineered in `COMPLETE_TWO_APP_AUDIT.md`. |
| `COMPLETE_TWO_APP_AUDIT.md` | **The spec** for the demo: `/m11` contract, m1–m50 mapping, value types, tolerance rules, forbidden nodes. |
| `.gitattributes` | Empty; irrelevant going forward (APKs are now plain git blobs). |

---

## 2. THE NINE AUDIT QUESTIONS — ANSWERED

### Q1. Current framework and build system
**NONE.** No `package.json`, no `node_modules`, no bundler, no `index.html`, no TS/JS config, no CI. The repository contains only Android binaries and Markdown reports. Everything web-side must be created from zero.

### Q2. Existing Firebase configuration and initialization
**No web Firebase configuration exists.** The only Firebase configuration in the repository is **embedded inside the two APKs** (decoded during the forensic audits):

| Item | Value / status |
|---|---|
| Project ID | `zaem-a8d30` |
| RTDB URL | `https://zaem-a8d30-default-rtdb.firebaseio.com` (hard-pinned by the demo Android client at startup) |
| Web API key | exists inside both APKs (APP 1 resource `0x7f10003c`; **redacted here** — standard public Firebase client key, not a server secret) |
| Storage bucket string | `zaem-a8d30.appspot.com` (unused by either app) |
| Auth | **none in either APK** — both access RTDB unauthenticated |
| SDK | firebase-database 19.3.1 (Android) — RTDB **only**; no Auth/Firestore/Storage/FCM/Functions anywhere |

**Initialization pattern to replicate (web):** default `initializeApp` + `getDatabase` with `databaseURL` — mirroring `FirebaseApp.initializeApp(this)` + `FirebaseDatabase.getInstance()` in both APKs.

### Q3. Existing authentication/login flow
**None on the web.** The Android operator app (APP 1) uses a **client-side hardcoded password `"MAGIC"`** (any non-empty ID + that literal). For the demo web app: `"MAGIC"` must **not** be shipped as-is to the browser as if it were security. A demo-grade gate is specified in the plan (§9, Milestone D) — clearly labeled *demo-only*, since the underlying Firebase project has no auth and the demo does not add any.

### Q4. Existing UI structure and routing
**None.** The Android UI to be functionally recreated (per the audits) is 3 screens: splash/gate → login gate → **operator console** (10×5 grid + multiplier ladder + Start/Show). Web routing will be trivial (single page + gate), specified in the plan.

### Q5. Existing components and reusable utilities
**None.** Everything is inside the APKs (Java/Android). The **reusable logic** extracted by the audits (and to be implemented as typed TS modules) is:
- grid generator (safe-cell curve: rows m1–m20 → 1, m21–m45 → 2, m46–m50 → 4);
- `/m11` writer (50 per-child upserts, `{"mN":"0"|"1"}` strings);
- `/m11` live mirror (child_added/child_changed);
- m→row→multiplier map (m1–5 ×1.23 … m46–50 ×349.68);
- progressive reveal choreography (row-by-row, 500 ms cadence in APP 1's "Show").

### Q6. Environment variables and configuration files
**Only `.gitattributes` (empty).** No `.env`, no secrets files, no CI config. The plan introduces `.env` (+ `.env.example`, `.gitignore`) for the Firebase web config — see §9/Milestone B. **No credential values will be committed.**

### Q7. Existing Firebase Realtime Database integration
**None in web code** (there is no web code). The RTDB integration that exists is **inside the APKs** and is fully documented:

- **Producer (APP 1):** `getReference("m11")`; 50 × `child("m"+N).updateChildren({"m"+N:"0"|"1"})` per publish; ChildEventListener mirror.
- **Consumer (APP 2):** continuous `ChildEventListener` on `/m11`; matches keys **by name**; `"1"`→win, `"0"`→lose; missing child ⇒ crash-on-click; extra children ignored; deletes ignored.
- **Contract to preserve (already present in the project's documentation and required by your spec):**

```json
/m11:
  m1:  { "m1":  "0" | "1" }   // strings, inner key == child name
  m2:  { "m2":  "0" | "1" }
  ...
  m50: { "m50": "0" | "1" }
```

### Q8. Does the repository already contain the behavior/UI of the original Android operator app?
**No — only as compiled binaries.** The behavior is fully documented (audits) but exists nowhere as web code. Nothing has been implemented; this audit precedes all implementation.

### Q9. Safest architecture for recreating the app as a web application
**A static SPA talking directly to Firebase RTDB (JS SDK), no custom backend** — because (a) the entire backend need is one node (`/m11`), (b) both existing Android clients already talk to RTDB unauthenticated from the client, so a browser client is architecturally identical, and (c) adding a server would add surface without adding demo value. Guardrails live in a single typed writer module. Full rationale + diagram in §8.

---

## 3. FIREBASE CONFIGURATION (what the demo needs, where it comes from)

| Need | Source | Committed? |
|---|---|---|
| `apiKey` | APK-embedded public web key (APP 1 resource `0x7f10003c`; value redacted in reports) | No — via `.env` (`VITE_FIREBASE_API_KEY`), `.env` gitignored; `.env.example` with placeholders committed |
| `authDomain` | derived: `<project>.firebaseapp.com` | same |
| `databaseURL` | `https://zaem-a8d30-default-rtdb.firebaseio.com` (public in both APKs; pinned by demo Android client — **must not be changed**) | same |
| `projectId` | `zaem-a8d30` | same |
| Storage/messaging IDs | not needed (RTDB only) | — |

> ⚠️ **Architecture decision encoded in this audit (needs your confirmation, §10-Q1):** the demo Android client (`1xbet_1.0.apk`) **hard-pins the `zaem-a8d30` RTDB URL at startup** and force-closes if it doesn't match. Therefore, for the existing demo Android client to observe the demo results, the web demo **must** write to **that same project's `/m11`**. A brand-new Firebase project would only work with a modified/rebuilt Android client (which is out of scope — APKs must not be modified).

---

## 4. CURRENT DATABASE INTEGRATION — SUMMARY

- Web: **none** (nothing exists).
- Documented (APK side): producer/consumer contract fully verified (see `COMPLETE_TWO_APP_AUDIT.md` §6–§9).
- **No Firebase data has been touched by any phase of this work, and none will be until you approve a controlled publish test.**

---

## 5. REUSABLE COMPONENTS (to be built — none exist yet)

Planned typed modules (implementation after approval):
1. `firebase.ts` — init (RTDB-only), connection-state hook.
2. `contract.ts` — `M_KEYS` (m1…m50), `ROW_MULTIPLIERS`, `M11Value`, `M11Node`, validators (string ∈ {"0","1"}, single-key object, key==child name).
3. `generator.ts` — demo result generator with APP 1's curve (configurable).
4. `writer.ts` — **the only module allowed to touch Firebase writes**; enforces: path `/m11/m{1..50}` only, all-50 invariant, string values, upsert-only, no deletes, no other nodes.
5. `mirror.ts` — `onChildAdded`/`onChildChanged` subscription → state store.
6. UI components: Gate, Ladder+Grid (10×5), PublishBar (Generate/Dry-run/Publish/Reveal), MirrorStatus, DemoBanner.

---

## 6. MISSING PIECES (complete inventory — everything must be created)

| Category | Missing |
|---|---|
| Scaffold | package.json, Vite config, TS config, Tailwind, index.html, .gitignore, .env(.example) |
| Firebase | JS SDK dep, init module, env wiring |
| Contract layer | types + validators + writer + mirror (as above) |
| Features | demo gate, grid generator, 10×5 grid UI, progressive reveal, publish flow, live mirror indicator |
| Safety | writer guardrails, dry-run mode, demo banner ("simulation — no real money"), forbidden-node blacklist (/main, /xbetmoney, /users, /bet1, /data) |
| Tests | contract unit tests (validator/writer shape), manual compatibility test plan vs demo Android client |
| Docs | README (demo scope, env setup, publish procedure) |

---

## 7. COMPATIBILITY RISKS (carried from the verified audits; mitigations in plan)

| # | Risk | Severity | Mitigation (planned) |
|---|---|---|---|
| R1 | Demo Android client pins the DB URL → wrong project = client won't see anything | **Blocker if wrong** | Target `zaem-a8d30` `/m11` exactly (pending your confirmation, §10) |
| R2 | Missing child (`mN`) ⇒ APP 2 **crashes on click** of that apple | High | Writer enforces all-50 invariant; unit test |
| R3 | Value type drift (number/boolean/object) breaks consumer | High | Validator: strings `"0"/"1"` only; shape `{"mN": v}` |
| R4 | Writing forbidden nodes: `/main` changes **force-close** players on the splash screen; `/xbetmoney/money` is the client's shared balance | High | Writer hard-restricted to `/m11/m{1..50}`; no other refs in code |
| R5 | Deleting/replacing `/m11` root leaves stale/crashy state | Medium | Upsert-only; `remove()`/`set()` never used |
| R6 | Public unauthenticated DB — anyone can tamper with demo data | Medium (accepted for demo) | Document; never add real features on this project; optional later hardening requires updating both APKs (out of scope) |
| R7 | `"MAGIC"` password reused client-side as if secure | Low (demo) | Demo gate via env passcode, labeled non-security; real auth explicitly out of demo scope |
| R8 | Brand/legal exposure (1Xbet marks, deposit imagery in APK 2) | Medium | Demo UI uses **neutral branding**; no wagering/deposit/payment UI anywhere; prominent "DEMO SIMULATION" banner (§10-Q4) |
| R9 | Firebase project ownership unverified (rules/hosting access) | Medium | Demo assumes current public rules; no rules changes requested or needed |
| R10 | Mid-round publish changes outcomes for players mid-game | Low (existing behavior) | Preserve APP 1 semantics (values simply update); operator UX shows "live" warning |

---

## 8. RECOMMENDED ARCHITECTURE (demo)

```
┌───────────────────────────────────────────────┐
│  Browser — DEMO Web Operator Console (SPA)     │
│  Vite + React + TypeScript + Tailwind          │
│  • demo gate (env passcode, non-security)      │
│  • generate demo result (curve 1/1/1/1/2/2/    │
│    2/2/2/4 — configurable)                     │
│  • 10×5 grid + multiplier ladder               │
│  • dry-run (no writes) | publish (50 upserts)  │
│  • progressive reveal (UI-only choreography)   │
│  • live mirror via child_added/child_changed   │
│  • "DEMO — simulation only" banner             │
└───────────────┬───────────────────────────────┘
                │ Firebase JS SDK (RTDB only, unauthenticated — same as both APKs)
                ▼
   Firebase RTDB  zaem-a8d30 ──►  /m11  (m1…m50, {"mN":"0"|"1"} — VERIFIED contract)
                ▲
                │ ChildEventListener on /m11 (unchanged)
   Existing DEMO Android client (1xbet_1.0.apk — unmodified, observes results)
```

**What stays:** Firebase project + `/m11` contract + Android client (untouched). **What's new:** the SPA. **What's deliberately absent:** any backend server, any payment/wagering feature, any 1Xbet integration, any credential in git.

---

## 9. PRECISE IMPLEMENTATION PLAN (NOT started — awaiting approval)

**Milestone A — Scaffold (no Firebase)**
A1. Vite + React + TS + Tailwind; `.gitignore` (node, dist, `.env`); `.env.example` placeholders; README skeleton with demo-scope statement.
A2. Static UI shell: demo banner, gate screen, console layout (ladder + 10×5 grid placeholders), routing (gate → console).
*Output: runnable local demo with zero external calls.*

**Milestone B — Firebase wiring (reads only, no writes)**
B1. `.env` → `firebase.ts` (initializeApp + getDatabase with `databaseURL`); connection-state indicator.
B2. `contract.ts` (types, key list, multipliers, validators) + unit tests.
B3. `mirror.ts`: subscribe `/m11` child events → render current stored grid (read-only view of what the demo Android client sees).
*Output: console displays live `/m11` state; nothing written.*

**Milestone C — Demo generation + DRY-RUN only**
C1. `generator.ts` (APP 1 curve, configurable); "Generate" fills the grid locally.
C2. Progressive reveal choreography (row cadence ~500 ms, matching APP 1's Show) — purely client-side.
*Output: full demo flow locally, still zero Firebase writes.*

**Milestone D — Publish (the only write path) + gate**
D1. `writer.ts` with hard guardrails (R2–R5): all-50, strings, `update()` per child, `/m11` only; blocked-node blacklist; publish confirmation dialog ("this will be visible to connected demo clients").
D2. Demo gate: passcode from env (`VITE_DEMO_PASSCODE`), explicit "demo-only, not security" label.
D3. Controlled compatibility test (requires your go-ahead + a test window): publish one demo grid → verify on the demo Android client → confirm no forbidden nodes touched.
*Output: end-to-end demo, contract-proven.*

**Milestone E — Polish + docs**
E1. Publish history (session-local), status toasts, error states (permission denied / offline), mobile-responsive pass.
E2. README final: setup, env, publish procedure, compatibility notes, demo disclaimer.
*Output: deliverable demo.*

**Explicitly out of scope:** modifying either APK, changing Firebase rules/data outside approved test publishes, payments, wagering, real-brand assets, Telegram/GitHub kill-switch replication, backend server.

---

## 10. OPEN QUESTIONS (need your answers before Milestone A)

1. **Q1 — Firebase target:** confirm the demo must write to the **existing** `zaem-a8d30` `/m11` (required for the existing demo Android client to observe results, per its URL pinning). *(Recommended: YES.)*
2. **Q2 — Publish permission:** Firebase writes stay disabled (dry-run only) until you explicitly approve the Milestone D test — confirm.
3. **Q3 — Generator curve:** keep APP 1 parity (1/1/1/1/2/2/2/2/2/4 safe cells bottom→top) or make it fully random/configurable in the demo UI? *(Recommended: parity default + configurable toggle.)*
4. **Q4 — Branding:** confirm neutral demo branding (no third-party bookmaker marks) with a visible "DEMO SIMULATION — no real money" banner. *(Recommended: YES.)*
5. **Q5 — Deploy target:** local-only, or hosted (e.g., Firebase Hosting on the same project — requires project ownership)? *(Recommended: local-only for now.)*

---

## ✋ STOP — APPROVAL GATE

**Status:** audit complete. No code written, no Firebase data touched, no configuration changed — exactly as instructed.

**Waiting for:** your approval of this audit + answers to Q1–Q5 (especially Q1 and Q2) before starting **Milestone A**.

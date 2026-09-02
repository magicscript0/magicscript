# COMPLETE TWO-APP COMPATIBILITY AUDIT — FINAL (READ-ONLY)

**Date:** 2026-09-02 · **Repo:** `saifselme7/apk-app` · **Audited state:** `origin/main @ 7f4d45d` (APP 2 binary verified: sha256 `a6bba9b6b53a466e6d7dc3678a1359a83bdf53b6052da5423a010187a65026eb`, 86,593,521 bytes — bit-identical to the originally-promised LFS object)
**Method:** static analysis only. Both APKs unpacked; manifests & resources decoded; app DEXes fully decompiled (APP 1: 98 classes; APP 2: 502 classes) with Androguard/DAD; every ambiguous spot verified against raw Dalvik bytecode; APP 2's custom string obfuscation (Base64 + repeating-XOR key `"UTF-8"`, decoder class `La;` in `classes66.dex`) fully broken and **all 200+ obfuscated strings decoded and mapped**. No Firebase instance was contacted. No secrets are reproduced in this report (existence + location only).
**Repo status:** UNMODIFIED (report files only; no commits, no pushes; both APKs untouched).

---

## 0. TL;DR — THE CONTRACT IS PROVEN

APP 2 (`git.evil.i2`, "1xbet") is a **player-facing fake-casino app** whose Apple-of-Fortune game reads the exact `/m11` node that APP 1 (`apple.com`) publishes — **same Firebase project (`zaem-a8d30`), same 50 child keys (`m1`–`m50`), same nested-object shape `{"mN":"0"|"1"}`, same row→multiplier mapping, `"1"`=win / `"0"`=lose**. APP 2 never writes to `/m11`; it only listens with a continuous `ChildEventListener`. APP 2 additionally has its own nodes (`/xbetmoney`, `/users`, `/bet1`, `/main`, `/data`), a **GitHub-hosted remote kill-switch**, and a **Telegram device-fingerprint exfiltration** channel — none of which APP 1 touches. **A website can replace APP 1: APP 2 depends only on the Firebase data, not on APP 1 itself.**

---

## 1. BOTH APKs — IDENTITY

| Property | **APP 1** (`base.apk`) | **APP 2** (`1xbet_1.0.apk`) |
|---|---|---|
| Size | 10,471,317 B | 86,593,521 B (mostly media: 21.9 MB Lottie `vid.json`, `video.mp4`, ~1.5 MB game PNGs) |
| Package | `apple.com` | `git.evil.i2` |
| App label | "Apple" | "1xbet" |
| Version | 1.0 (code 1) | 1.0 (code 1) |
| SDKs | min 21 / target 34 / compile 33 | min 21 / target 34 / compile 33 |
| Framework | **Sketchware** (marker file + `SketchApplication`/`SketchLogger`/`DebugActivity`) | **Sketchware** (same runtime classes; no marker file, structure identical) |
| Signing | Android public **TESTKEY** (CN=Android), 2008–2035 | Android public **TESTKEY** (identical issuer/validity) |
| Activities | 4 (`Main`, `Login`, `Game`, `Debug`) | 10 (`Main`, `Home`, `Game`, `Menu`, `Games`, `Allgame`, `Deposit`, `Applee`, `Applegame`, `Debug`) |
| Services | Firebase `ComponentDiscoveryService` (**DatabaseRegistrar only**) | Firebase `ComponentDiscoveryService` (**DatabaseRegistrar only**) |
| Receivers / exported | none / launcher only | none / launcher only |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, SYSTEM_ALERT_WINDOW (unused) | INTERNET, ACCESS_NETWORK_STATE, READ_EXTERNAL_STORAGE |
| Code DEX | `classes70.dex` (119 app classes) | `classes68.dex` (503 app classes incl. ~490 obfuscated helper/event classes) + decoder `La;` in `classes66.dex` |
| Manifest flags | `usesCleartextTraffic=true`, `allowBackup=true` | same |
| Obfuscation | none | **app strings XOR+Base64 obfuscated** (decoder `La.a(String)`, key `"UTF-8"`) |
| Firebase project | **`zaem-a8d30`** (RTDB URL + web API key at resource `0x7f10003c`, redacted) | **`zaem-a8d30`** (identical URL/project/bucket strings at the same resource IDs) |
| Network libs | firebase-database 19.3.1 (+play-services) | firebase-database (+play-services) **+ OkHttp (trust-all TLS!) + HttpURLConnection** |

---

## 2. APP 1 ANALYSIS (re-verified; unchanged from previous audit)

**Role: operator console / grid publisher.** Splash (10 s) → gate (any ID + hardcoded password `MAGIC`, fake user counters) → console:
- Generates a random 10×5 grid: rows m1–m20 exactly **1** safe cell, m21–m45 exactly **2**, m46–m50 exactly **4** (`_sf1.._sf10`, uniform RNG, smali-verified).
- On **Start**: t=1500 ms fires **50 × `m11.child("m"+N).updateChildren({"m"+N: "0"|"1"})`** (strings; single-key object; inner key = child name). No other writes, no deletes.
- Continuous `ChildEventListener` on `/m11` mirrors values into 50 TextViews (multi-operator sync).
- Cosmetic fake dialogs ("CONNECTING TO 1Xbet…" etc.), reveal animation, no real 1Xbet connectivity, no other network.

**APP 1's complete Firebase footprint = `/m11` (read+write). Nothing else.**

---

## 3. APP 2 ANALYSIS (NEW — fully decompiled & de-obfuscated)

### 3.1 What it is
An Arabic-language (Egyptian locale, currency `ج.م`), 1Xbet-branded **fake casino / betting app** built for players. Flow: video splash → home → games menu → "APPLE OF FORTUNE" lobby (stake selector: MIN/X2/X½/MAX, 10/20/50 ج.م, one-click bet) → the apple game. Balance starts at 1000 ج.م. Includes deposit screens (**Vodafone Cash**, `15.00 ج.م` vouchers, image picker for payment proof) and a `successful` screen.

### 3.2 Screens (10 activities, all verified from layouts + code)

| Activity | Layout | Purpose | Firebase | External |
|---|---|---|---|---|
| `MainActivity` | `main` | video splash + **startup gate** | listens `/main` (gate), `/data` (no-op) | — |
| `HomeActivity` | `home` | casino home, balance | `/xbetmoney` | **Telegram device-info send**, GitHub check, writes `/xbetmoney/money` |
| `MenuActivity` | `menu` | side menu | `/xbetmoney`, `/users` (no-op) | GitHub check |
| `GamesActivity` | `games` | games list | `/xbetmoney`, `/users` (no-op) | GitHub check |
| `AllgameActivity` | `allgame` | all-games grid | `/xbetmoney`, `/users` (no-op) | GitHub check, writes `/xbetmoney/money` |
| `GameActivity` | `game` | another casino game page | `/xbetmoney` | writes `/xbetmoney/money` |
| `DepositActivity` | `deposit` | deposit (Vodafone Cash flow, image picker) | none | — |
| `AppleeActivity` | `applee` | **Apple-of-Fortune betting lobby** (stake UI) | `/xbetmoney`, `/users`, `/bet1` (no-ops) | GitHub check, writes `/xbetmoney/money` |
| `ApplegameActivity` | `applegame` | **the 10×5 apple game — consumes `/m11`** | **`/m11`**, `/xbetmoney`, `/users` | writes `/xbetmoney/money` |
| `DebugActivity` | — | Sketchware crash viewer | — | — |

### 3.3 Firebase usage (all on the **default** instance = `zaem-a8d30`)

| Node | Direction | Mechanism | Where | Effect |
|---|---|---|---|---|
| **`/m11`** | **READ ONLY** | **continuous `ChildEventListener`** (`mm`) | `ApplegameActivity` | fills 50 hidden state TextViews → apple win/lose (see §5–§7) |
| `/xbetmoney` | read+write | ChildEventListener (`ar` etc.) + ~20 write sites | all main screens | child `money` = **global shared balance** (one number for every installation); reads format as `0.0`; writes push the player's current balance back |
| `/users` | read only | ChildListeners (no-op: parse & discard) | 5 activities | **dormant** — no UI effect |
| `/bet1` | read only | ChildListener (no-op) | `AppleeActivity` | **dormant** |
| `/main` | read only | ChildListener (`qr`) | `MainActivity` | **startup gate**: child map must contain `typ == "true"` → proceed after 2.5 s; else toast "Error" and stay stuck (see risks) |
| `/data` | read only | ChildListener (`qn`, no-op) | `MainActivity` | dormant |

**APP 2 never writes to `/m11`. Never writes to `/users`, `/bet1`, `/main`, `/data`. Its only write is `/xbetmoney/money = {"money": "<balance string>"}`.**

### 3.4 The apple game mechanics (`ApplegameActivity` + 50 click chains)

- 50 clickable apples (54 click registrations = 50 apples + 4 control buttons), one per `m`-key.
- Clicking an apple: `pressed` image (`appleup`) → 500 ms → checker reads the hidden state TextView:
  - value `== 1.0` → **WIN**: `poi` image, payout chain: "Win / You won", `current winnings += stake × row-multiplier`, overlay buttons;
  - value `!= 1.0` (i.e., `0`) → **LOSE**: `appleoff` image, "Better luck next time!" / "Try again!", rows disabled.
- Multiplier per row = `stake × multiplier` applied to `current winnings` (constants verified as IEEE-754 doubles in each click class).
- Win/lose also **disables entire rows** (setEnabled) so each row is played once per round; "PLAY AGAIN (20 ج.م)" / "NEW STATE" re-enables rows and waits for the next grid.
- On exit/back: writes the session balance to `/xbetmoney/money` and returns to the lobby.
- **No server-side fairness**: outcome is fully determined by whatever `/m11` contains at click time.

### 3.5 External channels of APP 2 (NOT shared with APP 1)

| Channel | Endpoint (decoded) | Purpose |
|---|---|---|
| **GitHub raw config** | `https://api.github.com/repos/barazili1/attal/contents/attal.txt` (HTTP GET, field `content`, Base64-decoded) | **remote kill-switch**: fetched on 6 screens; if decoded value ≠ the hardcoded version TextView → toast + `finishAffinity()` (app closes) |
| **Telegram Bot API** | `https://api.telegram.org/bot<BOT_TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=…` — **a real bot token and chat id are hardcoded (obfuscated) in `HomeActivity`** (values redacted here; located at the `a.a("…")` literals in `HomeActivity` around the device-info builder) | on (first) launch sends `📥 New device joined the app:` + full device fingerprint (manufacturer, model, ANDROID_ID, OS, brand, product, hardware, board, host, device, custom name…) to the operator; `last_device_info`/`device_info` keys gate re-sending |
| **OkHttp client `ro`** | generic GET/POST/PUT/DELETE, `application/json`, **trust-all `X509TrustManager` + permissive hostname verifier (TLS verification disabled)** | HTTP utility (Telegram path uses `HttpURLConnection`+`URL`; `ro` exists as a secondary client) |
| DB-URL pinning | `MainActivity` asserts the default DB URL equals `https://zaem-a8d30-default-rtdb.firebaseio.com` (on `onChildAdded`) — and, in `onChildChanged` of `/main`, compares against a **second project** `https://new-io8-default-rtdb.firebaseio.com` and **kills the app if it doesn't match** (copy-paste bug ⇒ any write to `/main` while a player sits on the splash force-closes that player's app) | anti-tamper |
| Anti-enulator | requires `/data/local/tmp/` to exist | gate condition |
| Phone number | an Egyptian mobile number is embedded (obfuscated) with a copy-to-clipboard action (`os` class) | operator contact |

**APP 1 has none of these channels; APP 2's extra channels do not involve APP 1.**

### 3.6 String obfuscation (for future maintainers)
All sensitive literals are `Base64(repeating-XOR(key="UTF-8"))`, decoded at runtime by root-package class `La;->a(String)` (`classes66.dex`). 200+ strings decoded during this audit, including every Firebase key, URL, color, and the credentials noted above.

---

## 4. FIREBASE ARCHITECTURE (both apps, verified)

```
                         Firebase RTDB  project zaem-a8d30
                         https://zaem-a8d30-default-rtdb.firebaseio.com
                         (no Firebase Auth in EITHER app → public rules inferred)
  ┌──────────────────────────────┬─────────────────────────────────────────┐
  │  /m11      m1…m50            │  THE INTER-APP CONTRACT                 │
  │    {"mN":{"mN":"0"|"1"}}     │  APP 1 writes · APP 2 listens            │
  ├──────────────────────────────┼─────────────────────────────────────────┤
  │  /xbetmoney/money            │  APP 2 only (global fake balance)        │
  │  /users  /bet1  /data        │  APP 2 only (dormant listeners)          │
  │  /main (typ:"true" gate)     │  APP 2 only (startup gate + kill bug)    │
  └──────────────────────────────┴─────────────────────────────────────────┘
     APP 1 (operator)                        APP 2 (player)
     writes /m11                             reads /m11 (+own nodes)
     nothing else                            + GitHub kill-switch, Telegram exfil
```

---

## 5. EXACT COMMUNICATION FLOW (verified end-to-end)

1. Operator presses **Start** in APP 1 → local RNG grid → **50 upserts** to `/m11` (burst ~t+1500 ms; per-child `updateChildren`).
2. Firebase RTDB fans each changed/added child out to every attached listener.
3. APP 2's `ApplegameActivity` (open on the player's screen) receives `onChildAdded`/`onChildChanged` per child → `mm` writes each value into the matching hidden TextView (arrival order irrelevant — keys are matched by name).
4. Player clicks apples → win iff that cell's value `"1"` → fake balance updated → written back to `/xbetmoney/money` on exit/round transitions.

**No other coupling exists between the two apps.** No intents, no deep links, no shared UID, no broadcasts, no shared storage, no direct socket/HTTP between them.

---

## 6. THE `/m11` CONTRACT (VERIFIED from both sides)

| Element | Contract |
|---|---|
| Project | `zaem-a8d30` (default instance — APP 2 pins this URL at startup) |
| Path | root child **`m11`** (exact) |
| Children | exactly **`m1` … `m50`** (verified needed: see §9 tolerance) |
| Child shape | **JSON object with exactly one key**, key name == child name: `{"m3": "1"}` |
| Value type | **string `"0"` or `"1"`** (numbers 0/1 also tolerated — see §9; booleans/objects are NOT) |
| Semantics | `"1"` = safe/winning apple (`poi` drawable, both apps) · `"0"` = losing apple (`appleoff`, both apps) |
| Row grouping | 5 consecutive keys per row; row multiplier per §7 |
| Producer | APP 1 `[Start]` — burst of 50 per-child upserts; never deletes; never touches other paths |
| Consumer | APP 2 `mm` — **continuous `ChildEventListener`** on `/m11` (NOT ValueEventListener, NOT single-read, NOT polling); `onChildAdded`+`onChildChanged` handled identically; `onChildRemoved`/`onChildMoved` ignored; `onCancelled` swallowed |

Safe example (no secrets):

```json
{
  "m11": {
    "m1":  { "m1":  "0" },  "m2":  { "m2":  "1" },  "m3":  { "m3":  "0" },
    "m4":  { "m4":  "0" },  "m5":  { "m5":  "0" },
    "…":   { "…":   "…" },
    "m48": { "m48": "0" },  "m49": { "m49": "1" },  "m50": { "m50": "1" }
  }
}
```

---

## 7. M1–M50 MAPPING (VERIFIED in BOTH apps — they agree exactly)

APP 2 layout `applegame.xml` shows the ladder top→bottom: x349.68 … x1.23 (same as APP 1's `game.xml`). Each apple's multiplier was extracted from its click class (IEEE-754 constants) and each checker's state TextView was traced to its `m`-key via `mm`.

| Firebase keys | Row (visual) | Multiplier | Safe cells APP 1 writes | APP 2 result |
|---|---|---|---|---|
| `m46–m50` | 1 (top) | ×349.68 | exactly 4 of 5 are `"1"` | `"1"`→`poi` win, `"0"`→`appleoff` lose |
| `m41–m45` | 2 | ×69.93 | exactly 2 | same |
| `m36–m40` | 3 | ×27.97 | exactly 2 | same |
| `m31–m35` | 4 | ×11.18 | exactly 2 | same |
| `m26–m30` | 5 | ×6.71 | exactly 2 | same |
| `m21–m25` | 6 | ×4.02 | exactly 2 | same |
| `m16–m20` | 7 | ×2.41 | exactly 1 | same |
| `m11–m15` | 8 | ×1.93 | exactly 1 | same |
| `m6–m10` | 9 | ×1.54 | exactly 1 | same |
| `m1–m5` | 10 (bottom) | ×1.23 | exactly 1 | same |

(Column order within a row is irrelevant to Firebase — each of the 5 keys maps to one apple; APP 2 matches keys by name, not position.)

---

## 8. DATA TYPES (verified)

| Layer | Type | Notes |
|---|---|---|
| `/m11` | object | |
| `/m11/mN` | object (map) | parsed by APP 2 as `HashMap` via `GenericTypeIndicator` — **a scalar at `/m11/mN` would throw in the listener and crash the game screen** |
| `/m11/mN.mN` | **string** `"0"` / `"1"` (APP 1's format) | APP 2 calls `.toString()` → then `Double.parseDouble(...) == 1.0 ? WIN : LOSE` |
| tolerated alternatives | numbers `0`/`1` (also `1.0`) | arrive as Long/Double → toString → parse OK |
| NOT tolerated | booleans (`"true"` → parseDouble crash), objects/arrays (garbage toString → crash), `null` | |
| `/xbetmoney/money` | string of a number, e.g. `"990.0"` | APP 2-only |

---

## 9. REAL-TIME BEHAVIOR & TOLERANCE (verified)

- **Listener type:** continuous `ChildEventListener` on `/m11` (APP 2) — attached while `ApplegameActivity` is open; initial snapshot arrives as 50 × `onChildAdded`; later changes as `onChildAdded`/`onChildChanged` per child. **No polling, no single-reads, no ValueEventListener anywhere in APP 2** (grep-verified across all 502 classes).
- **Reaction:** immediate per child (same push frame; sub-second). No batching, no "wait for all 50", no ordering dependency (keys matched by name via `containsKey`).
- **Missing children:** the corresponding TextView keeps its layout default — the literal string `"TextView"` → clicking that apple throws `NumberFormatException` (crash of the game screen). ⇒ **the website must always write all 50 children.**
- **Excess children:** ignored (only `m1..m50` checked). Extra keys are harmless.
- **Deletes:** `onChildRemoved` ignored → stale last values remain on screen (no crash, no reset). Deletion is still forbidden by contract (data hygiene + APP 1's own mirror ignores it too).
- **Mid-round changes:** a new grid arriving while the player is mid-round simply overwrites the hidden TextViews — the NEXT click uses the new values (no reset, no event). This is exactly how APP 1→APP 2 operate today.
- **One multi-location update vs 50 child upserts:** RTDB SDK semantics fan out a single `ref("m11").update({m1:{m1:"0"}, …})` into per-child `child_added`/`child_changed` events at listeners — observationally equivalent for `mm`. (**INFERRED** from documented SDK semantics; not live-tested — see §17.) Keeping APP 1's 50-upsert style is the zero-risk default.

---

## 10. API / NETWORK INVENTORY (both apps, exhaustive)

| App | Channel | Method | Endpoint / path | Auth | Purpose |
|---|---|---|---|---|---|
| 1 | Firebase RTDB SDK | websocket | `zaem-a8d30…/m11/m1..m50` | none | publish + mirror grid |
| 2 | Firebase RTDB SDK | websocket | `/m11` (read), `/xbetmoney` (rw), `/users`,`/bet1`,`/main`,`/data` (read) | none | game data, balance, gates |
| 2 | HttpURLConnection | GET | `https://api.github.com/repos/barazili1/attal/contents/attal.txt` | none | version gate / kill-switch |
| 2 | HttpURLConnection | GET | `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=…&text=…` | hardcoded bot token (redacted) | device-fingerprint exfiltration |
| 2 | OkHttp (`ro`) | GET/POST/PUT/DELETE | arbitrary; **TLS verification disabled** | — | generic client (secondary) |
| — | any 1Xbet API | — | **DOES NOT EXIST in either app** (brand is cosmetic) | — | — |

No WebViews, no Retrofit/Volley, no GraphQL, no custom TCP, no deep links, no app-to-app intents/broadcasts (only Sketchware's internal `pro.sketchware.ACTION_NEW_DEBUG_LOG`).

---

## 11. ROLES

- **APP 1** = (C) *an Android client that generates data locally and publishes it to Firebase.* Definitively NOT a server/API (no sockets, no exported components, no HTTP). Its replacement surface is exactly: *generate 50 values + upsert them to `/m11`.*
- **APP 2** = the player client. **Depends only on the DATA at `/m11`, not on APP 1 the application.** It cannot tell (and does not care) who wrote the grid. It additionally depends on its own nodes (`/xbetmoney`, `/main` gate) and on the GitHub/Telegram endpoints — all independent of APP 1.

---

## 12. WEBSITE-REPLACES-APP-1 FEASIBILITY

**YES — fully, with APP 2 unchanged.** Evidence:
1. APP 2's only consumption of APP 1's output is `/m11` (content + shape verified both sides).
2. APP 2 attaches no identity to the writer (unauthenticated RTDB; no auth tokens, no signatures, no device pairing on `/m11`).
3. All 50 keys, the nested-object shape, string values, row/multiplier mapping, and win/lose semantics match APP 1's writes 1:1.
4. APP 1 performs no other duty in the ecosystem (no API, no relay, no storage of APP 2 state).

Conditional caveat (operational, not blocking): while APP 2 instances are sitting on the **splash screen**, writes to **`/main`** can force-close them (the `/main` `onChildChanged` URL-pinning bug, §3.5). The website must simply never write `/main` (it has no reason to).

---

## 13. EXACT WEBSITE REQUIREMENTS (producer side)

**DATA GENERATION** — on demand, a 10×5 grid: rows `m1–m5`…`m46–m50` with exactly **1,1,1,1,2,2,2,2,2,4** safe cells respectively (uniform random placement within each row) — or any distribution the operator chooses (APP 2 tolerates any values; the curve above is APP 1's behavior, preserved for parity).

**FIREBASE** — on publish, write **all 50 children** to `/m11`: `ref("m11/m"+N).update({["m"+N]: v})` with `v ∈ {"0","1"}` **strings**. Never delete; never write other nodes; never write a scalar directly at `/m11/mN`; never a boolean.

**REAL-TIME** — subscribe to `/m11` child events for the operator's own mirror (`child_added`/`child_changed`), same as APP 1.

**COMPATIBILITY** — §14 contract, all items.

**UI (function only; visual redesign is free)** — auth gate for operators (replace `MAGIC`), grid console with ladder + publish + reveal-equivalents, publish confirmation, optional mirror of `/xbetmoney` balance for operator awareness (read-only; optional).

---

## 14. COMPATIBILITY CONTRACT (freeze this)

**Binding for the website (producer-verified + consumer-verified):**
1. Project & default instance URL unchanged: `zaem-a8d30` / `https://zaem-a8d30-default-rtdb.firebaseio.com` (APP 2 pins this URL at startup — changing projects breaks APP 2).
2. Node `/m11`, children `m1…m50`, exact names.
3. Child value = single-key object `{"mN": <value>}`, inner key == child name.
4. Value = string `"0"` or `"1"` (numbers tolerated; booleans/objects/scalar-at-child forbidden).
5. Always write **all 50** children per round (missing child ⇒ crash-on-click in APP 2).
6. Upsert semantics only (`update`); no `set` on `/m11` root, no `remove` anywhere.
7. No auth requirement added on the DB (both apps are unauthenticated).
8. **Never write `/main`, `/xbetmoney`, `/users`, `/bet1`, `/data`** (APP 2-owned; `/main` writes can kill splash-screen players; `/xbetmoney/money` is APP 2's shared balance).
9. Do not delete or migrate existing `/m11` data during rollout.

---

## 15. SECURITY CONSIDERATIONS (no values exposed)

| # | Finding | Impact |
|---|---|---|
| S1 | `/m11` (and everything else) on a **public, unauthenticated RTDB** (no Firebase Auth in either app) | anyone can read/write grids and the shared balance; the website inherits this |
| S2 | APP 1: hardcoded gate password `MAGIC` (client-side) | must not ship to browser; use real auth on the website |
| S3 | Firebase web API key embedded in both APKs (standard client config; redacted) | public knowledge; not abusable beyond S1 |
| S4 | **APP 2: hardcoded Telegram bot token + chat id (obfuscated)** — real live credential in the APK (location: `HomeActivity` XOR-literals; redacted here) | operator's Telegram channel is hijackable by anyone who decompiles the APK (as this audit did); **recommend the owner revoke/rotate that bot token**; irrelevant to the website contract |
| S5 | **APP 2: OkHttp with trust-all TLS + permissive hostname verifier** | MITM-able secondary channel |
| S6 | **APP 2: Telegram exfiltration of device fingerprints** (ANDROID_ID, model, etc.) on launch | privacy/legal exposure of the player app; not caused or fixed by the website |
| S7 | **APP 2: GitHub-hosted remote kill-switch** (`barazili1/attal/attal.txt`) | the whole player fleet can be killed by editing one public file; also a supply-chain risk for the operator |
| S8 | APP 2 `/main`-change bug force-closes apps (URL pinning against a second project `new-io8-…`) | operational hazard: never write `/main` |
| S9 | Fake-gambling product (1Xbet trademark, Vodafone Cash deposits, Egyptian users) | same legal/ethical blocker flagged in Phase 1 — now stronger: APP 2 *collects deposits* (Vodafone Cash screens) while outcomes are operator-controlled via APP 1 → this is functionally a rigged-gambling kit. Product/legal decision required before building the website. |
| S10 | Both APKs signed with the public Android TESTKEY | trivially repackagable; irrelevant to web |

---

## 16. VERIFIED / INFERRED / UNKNOWN

### VERIFIED (directly from APK code/resources)
- Both identities, SDKs, components, signatures, Sketchware origin (per §1).
- Same Firebase project `zaem-a8d30` in both apps (resource strings + code).
- APP 1: `/m11` only; 50 string upserts; generation curve 1/1/1/1/2/2/2/2/2/4.
- APP 2: full node map (§3.3); `/m11` read-only via continuous `ChildEventListener` (`mm`); no writes to `/m11`; only write is `/xbetmoney/money`.
- m1–m50 → row → multiplier mapping identical in both apps (§7).
- `"1"`=win (`poi`), `"0"`=lose (`appleoff`) in both apps.
- Value handling: `HashMap` + `toString` + `parseDouble==1.0` (§8–§9).
- Tolerance: excess children ignored; missing children ⇒ crash-on-click; deletes ignored (stale).
- APP 2 external channels: GitHub kill-switch, Telegram bot w/ hardcoded token+chat id, trust-all OkHttp, `/main` gate + kill bug, `/data/local/tmp/` check.
- No 1Xbet API in either app; no app-to-app communication of any kind.

### INFERRED (strong evidence, not live-tested)
- RTDB security rules are public read/write (both apps work unauthenticated; rules file not accessible without console).
- A single multi-path `update()` on `/m11` would be equivalent to 50 child upserts for APP 2 (documented SDK fan-out semantics).
- `/users`, `/bet1`, `/data` are vestigial (registered listeners with no observable effect in the sampled, structurally-identical handler classes — 4 of ~4 checked per pattern).
- APP 2's win flow adds `stake×multiplier` to a fake balance and persists it to `/xbetmoney/money` (code-verified chain; actual live DB values unseen).
- The GitHub `attal.txt` currently contains the "allowed" version string (app obviously runs for its users); content not fetched during this audit.

### UNKNOWN (cannot be proven from the APKs)
- Live contents/state of `/m11`, `/xbetmoney`, `/main` (never contacted).
- Actual RTDB security rules; Firebase project ownership.
- Whether the operator's GitHub file or Telegram bot are still live/rotated.
- Whether any OTHER client (a third app, a script) also reads `/m11`.
- Real-world deposit handling (whether Vodafone Cash payments actually occur off-app).

---

## 17. RISKS & BLOCKERS

1. **Legal/ethical (BLOCKER-class):** APP 2 collects player deposits (Vodafone Cash) for a rigged game whose outcomes the APP 1 operator (→ future website) controls. Replacing APP 1 with a website makes the operator tooling more accessible, not less. A product/legal decision is mandatory before Phase 2 build-out.
2. **Public DB:** once the website exists, `/m11` and `/xbetmoney` are trivially writable by anyone (S1) — abuse/tampering risk grows.
3. **Operational traps:** writing `/main` kills splash-screen players (S8); deleting `/m11` children mid-round leaves APP 2 stale; missing children crash APP 2 on click.
4. **Credential hygiene:** the Telegram bot token in APP 2 is compromised by design (S4) — owner should rotate regardless of the website.
5. Minor: schema drift (booleans/numerics) would break APP 2 (§8) — enforce strings.

## 18. RECOMMENDED NEXT STEP

Proceed to **Phase 2 (architecture preparation)** with the §14 contract frozen as the spec: choose write path (direct browser→RTDB via Firebase JS SDK = zero-change; or an optional Cloud Function gateway that reproduces the exact write shape), design operator auth (server-side; do NOT ship `MAGIC`), and stage a **read-only compatibility test** (write a test grid to `/m11` in a controlled window and confirm on a real APP 2 install — with the owner's Firebase console access). Resolve the legal question (Risk 1) before any public deployment.

---

# FINAL VERDICT

**A. Can the website replace APP 1 without modifying APP 2?**
**YES.** APP 2 depends exclusively on the *data* at `/m11` (shape, keys, values, semantics all verified end-to-end). It has zero dependence on APP 1 the application. A website reproducing APP 1's writes is indistinguishable to APP 2.

**B. What exact Firebase contract must the website preserve?**
Project `zaem-a8d30` (default RTDB instance, URL pinned by APP 2); node `/m11`; children `m1…m50`; each child an object `{"mN": "0"|"1"}` (**string** values, inner key == child name); all 50 written every round; upsert-only; no deletions; no writes to `/main`, `/xbetmoney`, `/users`, `/bet1`, `/data`; no auth added to the DB.

**C. What exact grid/key mapping must the website implement?**
`m1–m5`=row ×1.23 … `m6–m10`=×1.54, `m11–m15`=×1.93, `m16–m20`=×2.41, `m21–m25`=×4.02, `m26–m30`=×6.71, `m31–m35`=×11.18, `m36–m40`=×27.97, `m41–m45`=×69.93, `m46–m50`=×349.68 (top row). `"1"`=win/safe (`poi`), `"0"`=lose (`appleoff`). APP 1's generation curve: exactly 1 safe cell per row for m1–m20, 2 for m21–m45, 4 for m46–m50.

**D. Does APP 2 require any behavior that APP 1 currently does not provide?**
**No.** Everything APP 2 needs from the ecosystem is the 50-value grid at `/m11` — which APP 1 provides and the website will provide identically. (APP 2's other needs — `/xbetmoney` balance, `/main` gate, GitHub/Telegram — are self-contained in APP 2 and unaffected.)

**E. Are there any blockers to replacing APP 1 with a website?**
**Technical blockers: none.** All data-shape, timing, and listener constraints are satisfied by simple parity. Non-technical blockers stand: (1) the legal/ethical nature of the product (deposit-collecting rigged-gambling kit, §15-S9) must be resolved by the owner; (2) operational care items: never write `/main` (kills splash players), always write all 50 keys, strings only; (3) Firebase project ownership must be confirmed for any rules/hosting work.

**F. What should Phase 2 implement?**
1. Web console (React+TS+Vite+Tailwind per Phase-1 recommendation) with real operator auth (server-verified secret/session — never the `MAGIC` literal client-side).
2. Grid generator with APP 1's exact curve + a single "publish" action writing the 50 string upserts to `/m11` via Firebase JS SDK (Phase 2 option: keep 50 child-upserts for bit-perfect parity; a multi-path `update()` is an acceptable later optimization).
3. Realtime mirror of `/m11` (`child_added`/`child_changed`) in the operator UI.
4. Guardrails baked in: typed writer restricted to `/m11/m1..m50`, string values, all-50 invariant, no-delete, no access to other nodes.
5. A controlled compatibility test against a real APP 2 install before calling Phase 2 done. **(Not started — this phase remained read-only.)**

---

*End of audit. Repository untouched; both APKs unmodified; no Firebase data or rules changed; no credentials exposed (existence & locations only).*

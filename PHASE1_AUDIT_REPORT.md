# PHASE 1 — COMPLETE APK FORENSIC AUDIT & WEB MIGRATION DISCOVERY

**Date of audit:** 2026-09-02
**Repository:** `saifselme7/apk-app` @ commit `99b73d1` ("Add files via upload")
**Repository contents:** a single file — `base.apk` (10,471,317 bytes). No source code, no Gradle files, no Sketchware project files.
**Method:** static analysis only. APK unpacked, AndroidManifest & resources decoded, all 71 DEX files indexed, the app DEX (`classes70.dex`) fully decompiled to Java (98 classes) with Androguard/DAD, ambiguous decompiler output cross-verified against raw Dalvik bytecode. **No live Firebase requests were made. No credentials were used. No data was retrieved from any backend.**
**Repository status after audit:** UNMODIFIED (this report file is the only addition; nothing committed, nothing pushed).

**Tooling limitations encountered (documented per instructions):**
- `jadx` could not be installed (no Java runtime in sandbox; apt/GitHub release downloads blocked). Androguard's DAD decompiler was used instead; DAD has known artifacts (e.g., rendering object references as `int`), and every semantically ambiguous spot was verified against raw smali.
- Image drawables could not be visually inspected (no vision available in this environment). Their meaning is inferred from resource names and code logic, and is labeled as inference where applicable.
- The live Firebase Realtime Database contents and its security rules **could not be verified** — that requires Firebase project ownership credentials, which we do not have and did not attempt to obtain.

---

## 1. EXECUTIVE SUMMARY

`base.apk` is an Android application **built with Sketchware** (confirmed by the asset file `assets/make by Android sketchware master .txt` and the Sketchware runtime classes `SketchApplication`, `SketchLogger`, `SketchwareUtil`, `FileUtil`, `DebugActivity`).

- **Package / App ID:** `apple.com` — App label: **"Apple"** — versionName 1.0, versionCode 1.
- **What it is:** an **"Apple of Fortune" grid generator/publisher** themed around the **1Xbet** betting platform, with an **Arabic-language user-facing layer** (promo dialog in Arabic promoting a 1Xbet account with **promo code `C7N`**).
- **What it actually does:** after a splash screen and a gate screen (any ID + hardcoded password `MAGIC`), the operator presses **Start**, the app **locally generates a random 50-cell win/lose grid** (10 rows × 5 apples), **writes it to a single Firebase Realtime Database node `m11`**, and then theatrically "reveals" it row by row while displaying **fake** progress dialogs ("CONNECTING TO 1Xbet…", "CONNECTING TO ID …", "CONNECTING TO APPLE OF FORTUNE GAME…") and a **fake online-users counter**.
- **Backend:** there is **no server, no API, no authentication backend**. The only backend is **Firebase Realtime Database** (project `zaem-a8d30`), used through **one node (`m11`)** with **no Firebase Auth** (the app never authenticates — implying the DB is accessed publicly).
- **Second application:** only **one** APK exists in this repository. No second APK was provided. The ecosystem strongly implies a **separate player-facing client** that reads `m11` (or the external 1Xbet game itself), but **this could not be verified** — its contract is unknown beyond the `m11` schema this app writes.
- **Migration verdict:** technically simple to migrate (3 screens, one Firebase node, zero APIs). The dominant risks are **non-technical**: the app's mechanics are those of a betting-"prediction" tool with fabricated signals, 1Xbet trademark use, and a promo-code funnel. This must be resolved with the product owner before building anything.

---

## 2. EXISTING ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────┐
│  Android APK "apple.com" (Sketchware build, test-signed)     │
│                                                              │
│  MainActivity (splash, fake progress bar, ~10s)              │
│      └─► LoginActivity (ID + password gate "MAGIC",          │
│            fake "online user" counter 200–1000)              │
│              └─► GameActivity (operator console)             │
│                    • 10×5 Apple-of-Fortune grid              │
│                    • multiplier ladder x1.23 … x349.68        │
│                    • [Start] = randomize grid +              │
│                        staggered fake dialogs                │
│                    • [Show]  = row-by-row reveal             │
│                    • ChildEventListener on /m11 (live sync)  │
│  DebugActivity (Sketchware crash viewer)                     │
│  SketchApplication / SketchLogger / SketchwareUtil /         │
│  FileUtil / RadialProgressView (Sketchware runtime)          │
└─────────────────────┬────────────────────────────────────────┘
                      │  Firebase RTDB SDK 19.3.1 (NO Firebase Auth)
                      │  writes:  /m11/m1 … /m11/m50 = {"mN":"0"|"1"}
                      │  reads:   ChildEventListener on /m11
                      ▼
        Firebase Realtime Database  (project: zaem-a8d30)
        https://zaem-a8d30-default-rtdb.firebaseio.com
                      ▲
                      │  (presumed, UNVERIFIED)
        [Second/player-facing Android client — NOT in repo]
```

There is **no other network traffic, no HTTP API, no WebView, no deep link, no broadcast intent shared with other apps** (the only broadcast is Sketchware's build-time debug log `pro.sketchware.ACTION_NEW_DEBUG_LOG`).

---

## 3. APK ANALYSIS

### 3.1 Identity & build

| Property | Value |
|---|---|
| Package name / Application ID | `apple.com` |
| App label | "Apple" |
| versionName / versionCode | 1.0 / 1 |
| minSdk / targetSdk | 21 (Android 5.0) / 34 (Android 14) |
| compileSdk | 33 |
| Application class | `.SketchApplication` |
| Signing | `META-INF/TESTKEY.RSA` — the **public Android TEST key** (CN=Android, android@android.com, valid 2008-2035). **Not a release signature** — consistent with a Sketchware export; could never be published on Google Play as-is. |
| Manifest flags | `android:usesCleartextTraffic="true"`, `allowBackup="true"`, `requestLegacyExternalStorage="true"` |

### 3.2 Components (from decoded AndroidManifest.xml)

- **Activities (4):**
  - `.MainActivity` — launcher, portrait, exported (launcher only; no deep links/intent filters beyond MAIN/LAUNCHER)
  - `.LoginActivity`
  - `.GameActivity`
  - `.DebugActivity` — Sketchware crash viewer (theme: dialog)
- **Services (1):** `com.google.firebase.components.ComponentDiscoveryService` with a single registrar meta-data: `com.google.firebase.database.DatabaseRegistrar` → **only Firebase Realtime Database is registered.**
- **Receivers:** none.
- **Providers (2):** `androidx.startup.InitializationProvider`, `com.google.firebase.provider.FirebaseInitProvider` (both framework/SDK boilerplate).
- **Fragments:** none (single-activity-per-screen Sketchware pattern).
- **WebViews:** none.
- **Deep links / URL schemes / custom permissions:** none.

### 3.3 Permissions

| Permission | Used by app code? |
|---|---|
| `android.permission.INTERNET` | Yes (Firebase RTDB) |
| `android.permission.ACCESS_NETWORK_STATE` | SDK boilerplate only |
| `android.permission.SYSTEM_ALERT_WINDOW` | **Not referenced by any decompiled app code — unused/suspicious.** |

### 3.4 DEX / code layout

- **71 DEX files** (`classes.dex` … `classes71.dex`). All first-party code lives in **`classes70.dex`** (package `apple.com`, 119 classes incl. R classes; 98 non-R classes decompiled). All other DEX files are third-party libraries (≈2390 `com.google.*` classes, androidx, Lottie, etc.).
- No Kotlin (no `kotlin.jvm` / metadata). No native libraries (`lib/` absent). No code obfuscation of first-party code (class names are Sketchware-generated but readable).

### 3.5 Assets & notable resources

| Asset | Content |
|---|---|
| `assets/make by Android sketchware master .txt` (+ `.bak`) | Sketchware build marker ("make by Android sketchware master") — **confirms Sketchware origin** |
| `assets/fonts/font.ttf` | custom UI font (loaded by MainActivity/LoginActivity via `_changeActivityFont("font")`; GameActivity references a second font name `police1` that is **not present** in assets → falls back gracefully) |
| `assets/D.json`, `H.json`, `bl.json`, `s.json` | **Lottie animation files** (loader bubble, "Goodwin Thanks" hands, success checkmark). Bundled library + assets exist, but **no decompiled app code loads them** — likely unused template remnants. |
| `res/raw/vid.mp4` | bundled video — **not referenced by any decompiled code** (unused remnant) |
| `res/drawable*/poi.png` | image shown for grid value `"1"` (inference: "win/safe" apple — name + logic) |
| `res/drawable*/appleoff.png` | image shown for grid value `"0"` (inference: "lose/bomb" apple) |
| `res/drawable*/cvb.png` | default/hidden cell image (551 KB), also reset image |
| layouts: `main.xml`, `login.xml`, `game.xml`, `dialogue.xml`, `get.xml`, `server.xml`, `connect.xml`, `loading.xml` | only `main`, `login`, `game`, `loading` are referenced from code; `dialogue`/`get`/`server`/`connect` are unreferenced remnants (their Arabic texts document intent — see §10) |

### 3.6 Embedded URLs (complete list from all 71 DEX string pools)

Only SDK-internal URLs exist: `firebase.google.com/docs/...`, `github.com/firebase/firebase-android-sdk`, `www.googleapis.com/auth/...` (OAuth scope strings inside play-services), `plus.google.com`, Android XML namespaces. **No application-defined endpoint, no 1Xbet API URL, no analytics endpoint.** The app **never communicates with 1Xbet** — 1Xbet exists only as cosmetic text.

### 3.7 Firebase configuration (decoded from `resources.arsc`)

| Item | Value / location |
|---|---|
| Realtime Database URL | `https://zaem-a8d30-default-rtdb.firebaseio.com` (string resource `0x7f10003b`, key `firebase_database_url`) |
| Firebase project ID | `zaem-a8d30` (`0x7f10008f`) |
| Web API key | **exists** at `0x7f10003c` — value redacted per audit rules (standard Firebase client config key, not a server secret) |
| Mobile app ID | **exists** at `0x7f10003d` — partially masked: `1:983308…550193` |
| Storage bucket | `zaem-a8d30.appspot.com` (`0x7f10003e`) — **config present, but Firebase Storage SDK is NOT bundled and no code uses it** |
| FCM sender ID / default web client ID / Crashlytics key | **absent** — no FCM, no Google Sign-In, no Crashlytics |

> These values are the standard `google-services.json` values compiled into every Firebase app; they are client configuration, not credentials. No service-account keys, tokens or private keys exist anywhere in the APK.

### 3.8 Bundled libraries (class-count inventory across all DEX files)

| Library | Evidence | Used by app logic? |
|---|---|---|
| firebase-database **19.3.1**, firebase-common 19.3.1, firebase-database-collection 17.0.0, firebase-components 16.0.0, firebase-auth-interop 18.0.0 (transitive), play-services-base/basement 18.2.0, play-services-tasks 18.0.2 | `.properties` files + `com.google.*` classes | **Yes — the only network dependency** |
| Material Components, androidx (appcompat, constraintlayout, recyclerview, lifecycle, etc.) | class counts | UI framework |
| Lottie (`com.airbnb.lottie`, 306 classes) | classes + 4 asset JSONs | **Not observed in app code** (remnant) |
| TastyToast (`com.sdsmdg.tastytoast`) | classes | Yes (login error toasts) |
| Animatoo (`com.blogspot.atifsoftwares.animatoolib`) | classes | Yes (activity fade transitions) |
| darkiOS dialogs (`com.cyberalpha.darkios`) | classes | Bundled; direct use not observed in decompiled activities (remnant or used by unreferenced layouts) |
| Sketchware Master libs (`AndroidSketchwareMaster.Animation`, `androidX.Master12.AnimatedParticleView`) | classes | Yes (particle background effects) |
| Apache utils (`org.apache`, 391 classes), okio (transitive) | classes | Sketchware runtime remnants |

---

## 4. PROJECT STRUCTURE

The repository contains **no project structure** — only the compiled APK. Reconstructed logical structure:

```
base.apk
├── AndroidManifest.xml                    (decoded in §3)
├── classes70.dex                          (ALL first-party code)
│   └── apple.com
│       ├── MainActivity (+4 inner classes)      splash
│       ├── LoginActivity  (+12 inner classes)   gate screen
│       ├── GameActivity   (+60 inner classes)   operator console
│       ├── DebugActivity  (+1)                  crash viewer
│       ├── SketchApplication (+1), SketchLogger (+1)
│       ├── SketchwareUtil (+1), FileUtil        Sketchware runtime helpers
│       ├── RadialProgressView                   custom loading spinner
│       └── R.*                                   generated resources
├── classes*.dex (all others)              third-party libraries (§3.8)
├── assets/                                (§3.5)
├── res/                                   (§3.5)
├── META-INF/TESTKEY.RSA|SF, MANIFEST.MF   test-key signature
└── firebase-*.properties, play-services-*.properties   (SDK versions)
```

No Gradle files, no `google-services.json` (values are compiled into resources), no source metadata beyond what is listed. **Any "source structure" beyond this does not exist in the repository.**

---

## 5. FIREBASE ARCHITECTURE

### 5.1 Service-by-service verdict

| Firebase service | Used? | Evidence |
|---|---|---|
| **Realtime Database** | **YES — the entire backend** | `DatabaseRegistrar` in manifest; `FirebaseDatabase.getInstance()` in GameActivity |
| Cloud Firestore | No | No SDK classes, no registrar |
| Firebase Authentication | **No** | No `FirebaseAuth` usage anywhere in app DEX; no auth UI beyond the local hardcoded password check. `firebase-auth-interop` is a transitive dependency of firebase-database, never invoked. |
| Firebase Storage | No | Bucket string exists in config (auto-generated), but no Storage SDK/usage |
| Cloud Messaging (FCM) | No | No registrar, no sender ID, no notification code, `RECEIVE`/`POST_NOTIFICATIONS` permissions absent |
| Cloud Functions | No evidence | None callable from app; **cannot rule out server-side functions existing in the Firebase project, but nothing references them** |
| Remote Config / Analytics / Crashlytics / Performance | No | No SDK classes, no config keys |

### 5.2 Realtime Database — complete operation map

- **Database URL:** `https://zaem-a8d30-default-rtdb.firebaseio.com` (from resources; SDK also auto-discovers it).
- **Root path used:** **`m11`** — the only reference the app ever creates: `FirebaseDatabase.getInstance().getReference("m11")`.
- **Writes (only operation type that mutates):** 50 × `updateChildren()` — for N = 1…50: `m11.child("m" + N).updateChildren({ "m"+N : value })` where `value ∈ {"0","1"}` (**string**, not number/boolean). No `setValue` on the parent, no `removeValue()`, no transactions, no push IDs, no server timestamps.
- **Reads:** one `ChildEventListener` on `m11`:
  - `onChildAdded` / `onChildChanged`: deserialize child as `HashMap` and copy any present key `m1…m50` into the matching TextView (so multiple operator devices **mirror each other in realtime**).
  - `onChildRemoved`: result parsed but ignored (no UI reaction). `onChildMoved`: ignored. `onCancelled`: error code/message read but not surfaced.
- **Queries:** none (no orderBy/filter/limit — plain child listener).
- **Data structure (exact, verified):**

```json
{
  "m11": {
    "m1":  { "m1":  "0" },   // row 1, cells 1-5
    "m2":  { "m2":  "1" },
    ...
    "m50": { "m50": "0" }    // row 10, cell 5
  }
}
```

Semantics: `m1…m5` = row 1 (top, x1.23) … `m46…m50` = row 10 (bottom, x349.68). `"1"` = win/safe apple (`poi.png`), `"0"` = lose apple (`appleoff.png`). *(Visual meaning of the two images is inference from names/logic — images could not be visually inspected.)*

- **What else is in the database: UNKNOWN.** Other top-level nodes cannot be ruled out (the player app may use `users`, etc.). We did **not** probe the live database.

### 5.3 Authentication, Storage, Functions — summarized

- **Authentication:** none. No provider of any kind. The "login" is a local string comparison (see §10). RTDB is therefore accessed **unauthenticated** → strongly implies **public read/write security rules** (could not verify — no project access).
- **Storage:** unused (config string only).
- **Cloud Functions/HTTP endpoints:** none referenced by the app. Existence in the Firebase project: UNKNOWN.

---

## 6. API INVENTORY

| Feature | Method | Endpoint | Request | Response | Auth | Used By |
|---|---|---|---|---|---|---|
| Publish game grid | Firebase RTDB `updateChildren` (WebSocket/REST via SDK) | `wss://s<ns>.firebaseio.com/…` → node `/m11/m{1..50}` | `{ "mN": "0"\|"1" }` (strings) | ack / permission denied | **None (unauthenticated)** | GameActivity `[Start]` |
| Live grid sync | Firebase RTDB `ChildEventListener` | node `/m11` | subscribe | child snapshots `{ mN: HashMap }` | **None** | GameActivity (always-on) |
| Any HTTP/REST/GraphQL API | — | **UNKNOWN / NONE FOUND** | — | — | — | — |

**There are no other APIs.** No Retrofit/OkHttp/Volley/HttpURLConnection/WebSocket usage in app code; no app-defined URLs anywhere in the DEX string pools. The dialog texts "CONNECTING TO 1Xbet…" / "CONNECTING TO ID …" / "CONNECTING TO APPLE OF FORTUNE GAME…" are **purely cosmetic ProgressDialog messages — no network operation occurs behind them.**

---

## 7. NETWORK ARCHITECTURE

```
[APK: apple.com]  ──Firebase RTDB SDK 19.3.1 (secure wss to *.firebaseio.com)──►  /m11  on zaem-a8d30-default-rtdb
        └─(nothing else — no HTTP APIs, no WebViews, no sockets, no deep links, no broadcasts to other apps)
[1Xbet platform]  ◄── NO connection of any kind (brand referenced in UI text only)
```

- Cleartext traffic is *allowed* by the manifest (`usesCleartextTraffic="true"`) but **no cleartext call is ever made** (Firebase uses TLS).
- DNS/hosts pinning, certificate pinning: none.

---

## 8. RELATIONSHIP BETWEEN BOTH APPLICATIONS

**Finding: the repository contains only ONE application.** The prompt states two related Android applications exist. Candidate interpretations, with what the evidence supports:

1. **A second, player-facing "Apple of Fortune" client (most plausible, UNVERIFIED):** this APK is clearly an **operator/publisher console** (it generates and publishes grids; it never renders a playable game). A separate client — presumably another Sketchware app used by "players" — would **read node `m11`** and render the apples. That client is **not in the repository**, so its exact contract, package name, and behavior **could not be verified**. The only contract this app imposes on it is the `/m11` schema in §5.2.
2. **The second "application" being 1Xbet itself:** rejected as a technical integration — there is **zero communication** with 1Xbet (no URLs, no APIs). 1Xbet appears only as brand text and an Arabic promo-code dialog (`C7N`).

```
Application A (THIS APK — operator console, "publisher")
        ↓ writes {mN:"0"|"1"} × 50
   Firebase RTDB  /m11        ← the entire "communication layer"
        ↓ (read — inferred, UNVERIFIED)
Application B (player client — NOT provided; contract UNKNOWN beyond /m11)
```

- Which app is the client? **Both are thin clients; Firebase RTDB is the only "server".**
- Does either app act as an API layer? **No.** Neither serves anything to the other; they share state only through `/m11`.
- What breaks if this APK is removed? **Nothing existing breaks for B except that grid data stops being refreshed** (B would keep reading the last published grid, or show nothing if the node is deleted). No API contract breaks because **no app-to-app API exists**.

---

## 9. BACKEND ANALYSIS

### Is the Android application itself acting as a backend/API server?

**NO.**

- It opens **no listening socket**, runs **no server**, exposes **no services to other apps** (its only service is the Firebase SDK's component discovery), and defines **no content provider** of its own.
- All "backend" behavior = **writes to Firebase RTDB node `/m11`**. Firebase is the backend; this app is a **client** (an operator console).
- Therefore: **nothing server-side needs to be "moved out" of the app.** A web migration only needs to (a) reproduce the grid generation + publish logic and (b) keep the `/m11` write schema identical. If genuine accounts/roles are ever required, that capability **does not exist today** and would be net-new (see §14/§17).

---

## 10. BUSINESS LOGIC

### 10.1 Screen flows (Input → Processing → Backend → Output)

**F1 — Launch/Splash (`MainActivity`, layout `main.xml`)**
"For Better performance please wait...." + progress bar animated 0→100 in a background thread (100 ms/step) + particle background; a `Timer` fades the logo every second; after **10 s** → `LoginActivity` (fade transition). *No Firebase use, no data.* (Activity is not finished — back button returns here.)

**F2 — Gate screen (`LoginActivity`, layout `login.xml`)**
- Header shows `online user : NN` where NN = `SketchwareUtil.getRandom(200,1000)` refreshed **every 2 s — fabricated** (no network).
- Inputs: `Your Id ?` (numeric EditText) and `Password ` (password EditText). Both pre-fillable via intent extras `id`/`pass` (nothing sends them — dormant).
- **LOGIN button:** shows a Telegram-style loader (custom `RadialProgressView`) for **3 s** (cosmetic delay), then:
  - empty ID → TastyToast *"incorrect ID"*;
  - password ≠ **`"MAGIC"`** (hardcoded, client-side) → TastyToast *"incorrect password "*;
  - success → starts `GameActivity` **twice** (once bare, once with extra `aps` = the entered ID — Sketchware logic bug; harmless duplicate) with bounce animation.
- *No Firebase use. The entered ID is never transmitted anywhere.*

**F3 — Operator console (`GameActivity`, layout `game.xml`)**
- Header: `Online Users` = `getRandom(20,600)` every 2 s (**fabricated**); `Your ID : ` + value from intent extra `aps`.
- Ladder labels (static): x349.68, x69.93, x27.97, x11.18, x6.71, x4.02, x2.41, x1.93, x1.54, x1.23 (top→bottom as laid out; 10 rows).
- 50 hidden state TextViews (`textview1..50`) + 50 ImageViews (`im1..im50`, default `cvb.png`).
- On open: `ChildEventListener` on `/m11` — **live syncs the 50 values into the TextViews** (multi-device mirror).
- **[Start] button** — staggered timer tasks:
  - t=0: ProgressDialog **"CONNECTING TO 1Xbet..."** (cosmetic);
  - t=100…1000 ms: `_sf1()…_sf10()` at 100 ms intervals — **random grid generation** (details below);
  - t=1500 ms: **publish to Firebase** — all 50 × `updateChildren` (§5.2);
  - t=2000 ms: dialog → **"CONNECTING TO ID \<entered ID\>..."** (cosmetic);
  - t=4000 ms: dialog → **"CONNECTING TO APPLE OF FORTUNE GAME..."** (cosmetic);
  - t=6000 ms: dismiss + reset all 50 images to `cvb.png`.
- **[Show] button** — row-by-row reveal every 500 ms (10 rows, 4.5 s total): fade effect then set each `im` to `poi.png` if value `=="1"` else `appleoff.png` (if `=="0"`).

**F4 — Grid generation algorithm (exact, verified incl. smali):**

| Rows (cells) | Function | Safe cells ("1") per row |
|---|---|---|
| Row 1 (`m1–m5`) … Row 4 (`m16–m20`) | `_sf1…_sf4`: uniform pick of 1 index in 1..5 | **exactly 1** |
| Row 5 (`m21–m25`) … Row 9 (`m41–m45`) | `_sf5…_sf9`: pick 2 distinct indices in 0..4 | **exactly 2** |
| Row 10 (`m46–m50`) | `_sf10`: shuffle [0..4], take first 4 (verified `if-ne v0, 4` in bytecode) | **exactly 4** |

Uniform `java.util.Random`/`Math.random` — no odds tuning, no seeding, no house-edge logic; everything else about "prediction" is presentation.

**F5 — Crash handling (Sketchware default):** uncaught exceptions logged; `DebugActivity` displays the stack (extra `error`). `SketchLogger` broadcasts `pro.sketchware.ACTION_NEW_DEBUG_LOG` (build-time debug facility only).

### 10.2 Cross-cutting logic

- **Validation:** only empty-ID and password equality checks. No format validation, no rate limiting, no error handling on Firebase writes (`onCancelled` swallows errors).
- **Roles/permissions:** none. Anyone with the password `MAGIC` (i.e., anyone with the APK) is an "operator".
- **Data creation/modification:** only `/m11/m1..m50` upserts. **Deletion: never.**
- **Notifications:** none (no FCM, no local notifications).
- **Background tasks:** none beyond in-activity `Timer`/`Thread` UI choreography. Nothing survives app exit.
- **Unreferenced layouts documenting product intent (not wired to code):** `dialogue.xml` — Arabic dialog: "اعمل حساب جديد في 1XBET" ("create a new account on 1XBET") + "بالبروموكود (C7N) علشان تربط حسابك" ("with promo code C7N to link your account"); `server.xml` — "جار الاتصال بسيرفر......" ("connecting to server…"); `get.xml`, `connect.xml` — generic OK dialogs.

---

## 11. SCREEN & FEATURE INVENTORY

| Screen | Purpose | Data Source | Actions | Auth Required | Navigation |
|---|---|---|---|---|---|
| `MainActivity` (splash) | Branding + artificial 10 s wait | none | none (auto) | No | → LoginActivity after 10 s |
| `LoginActivity` (gate) | Filter users; collect 1Xbet-style ID; fake "online user : 200–1000" counter | local RNG | LOGIN (3 s loader) | Local only: ID non-empty + password `MAGIC` | → GameActivity (started 2×, extra `aps`=ID) |
| `GameActivity` (operator console) | Generate/publish/reveal Apple-of-Fortune grid; fake "Online Users 20–600" | **Firebase `/m11`** + local RNG | **Start** (randomize + publish + fake dialogs), **Show** (row reveal) | None beyond previous screen | none (back returns to Login) |
| `DebugActivity` | Crash log viewer | intent extra `error` | select/copy text | No | reached only on crash |
| (unreferenced) `dialogue`/`get`/`server`/`connect` layouts | promo-code dialog (C7N / 1XBET), server-status placeholders | static | OK / Login buttons | — | — |

---

## 12. DATA MODEL

**Verified (the only data this app reads/writes):**

```
zaem-a8d30-default-rtdb
└── m11                         (object — game grid "table")
    ├── m1  : { m1  : "0"|"1" }   row 1 cell 1  …
    ├── m2  : { m2  : "0"|"1" }
    ├── …
    └── m50 : { m50 : "0"|"1" }   row 10 cell 5
```

- Values are **strings** `"0"`/`"1"`. `"1"` = safe/winning apple, `"0"` = losing apple.
- No users, profiles, roles, timestamps, references, arrays or nested objects are written by this app.

**Conceptual domain model implied (partly UNKNOWN):**

```
Operator (human)
 ├── enters "ID" (1Xbet-style account id) — NEVER stored or transmitted (display only)
 └── password (shared static secret "MAGIC" — client-side)

Grid (one at a time, no history)
 ├── 10 rows × 5 cells, difficulty curve 1/1/1/1/2/2/2/2/2/4 safe cells
 ├── multiplier ladder: 1.23, 1.54, 1.93, 2.41, 4.02, 6.71, 11.18, 27.97, 69.93, 349.68
 └── persisted at /m11 (overwritten in place; no round IDs, no timestamps)

Player (inferred, app NOT provided): UNKNOWN
 ├── presumably reads /m11
 └── user accounts / balances / history: UNKNOWN (no evidence in this APK)
```

Anything beyond `/m11` (e.g., a `users` node for a player app) **could not be verified**.

---

## 13. SECURITY FINDINGS (documented, not exploited)

| # | Finding | Impact on future web architecture |
|---|---|---|
| S1 | **Hardcoded shared password `"MAGIC"`** inside the client (LoginActivity$1$1$1) | Anyone with the APK has full operator access. On web this must become real server-side auth; the static secret cannot be shipped to a browser. |
| S2 | **Firebase Web API key + DB URL embedded in APK** (resources `0x7f10003c/3b`) | Standard Firebase client config (not a server secret), but combined with S3 it means anyone can read/write the DB with curl. The key itself was redacted here per audit rules. |
| S3 | **No Firebase Auth at all** → RTDB rules are effectively **public read/write** (inferred; rules could not be read) | The whole "backend" is unauthenticated. A web client will inherit this; anyone can tamper with `/m11`. Locking rules down breaks the existing Android clients unless they are updated too. |
| S4 | **Client-side authorization** — the "operator" role is enforced only by a local string compare | Must move to server/Firebase-Auth-based roles on web. |
| S5 | **Sensitive-looking data:** the user-entered ID (likely a 1Xbet account ID) stays on-device (never transmitted) — good; but a web rebuild may tempted to log/store it → needs a privacy decision. | PII policy needed. |
| S6 | `usesCleartextTraffic="true"` (no cleartext call currently made) | Web: enforce HTTPS/HSTS; flag is moot. |
| S7 | `allowBackup="true"` + test-key signature (`TESTKEY.RSA`) | APK can be trivially repackaged; irrelevant to web but confirms non-store distribution. |
| S8 | `SYSTEM_ALERT_WINDOW` permission requested but **unused** | Remove in any future client; flagged as suspicious. |
| S9 | **Deceptive UX by design:** fabricated "connecting to 1Xbet/server" dialogs, fabricated user counters, random grid presented as a "prediction" for a real-money betting game; 1Xbet trademark + promo code `C7N` funnel | **The most serious finding — legal/ethical, not technical.** A web replica could constitute gambling-fraud tooling and trademark infringement in many jurisdictions. Must be resolved at product level before any build. |
| S10 | No secrets, service-account keys, or tokens exist anywhere in the APK | Nothing to rotate/leak. |

---

## 14. WEB MIGRATION CLASSIFICATION

| Feature | Classification | Notes |
|---|---|---|
| Splash/intro screen | **DIRECT WEB MIGRATION** | trivial route/animation |
| Gate screen (ID + password) | **WEB REIMPLEMENTATION REQUIRED** | replace hardcoded `"MAGIC"` with real auth (or keep shared-secret **server-side**) |
| Grid generation (`_sf1.._sf10`) | **DIRECT WEB MIGRATION** | pure client-side RNG; 10 rows, safe-cell curve 1,1,1,1,2,2,2,2,2,4 |
| Publish grid to `/m11` | **FIREBASE CAN BE REUSED** | Firebase JS SDK writes same shape; keeps Android mirror in sync |
| Live `/m11` sync (ChildEventListener) | **FIREBASE CAN BE REUSED** | `onChildAdded`/`onChildChanged` map 1:1 to JS SDK events |
| Row-reveal choreography, dialogs, toasts, particles | **WEB REIMPLEMENTATION REQUIRED** (presentation) | CSS/JS animations; **decision needed** on whether fake "connecting" dialogs and fake user counters are kept (see S9) |
| Operator multi-device mirror | **FIREBASE CAN BE REUSED** | falls out of RTDB listeners |
| Real accounts/roles/audit | **BACKEND REQUIRED** (net-new) | does not exist today |
| Any existing HTTP API | — | **none to reuse** |
| Android-only pieces: `SYSTEM_ALERT_WINDOW`, Apache/FileUtil, Sketchware debug broadcast, Animatoo transitions, apk signature/backups | **ANDROID-ONLY** | dropped |
| Player-facing client contract | **UNKNOWN** | second app not provided |

---

## 15. RECOMMENDED WEB STACK

Chosen strictly against the discovered architecture (a 3-screen realtime RTDB client with zero APIs):

| Layer | Choice | Why it fits *this* app |
|---|---|---|
| Frontend framework | **React + TypeScript (Vite SPA)** | 3 screens, no SEO requirement, realtime-UI-centric; a full Next.js/SSR framework adds nothing here. TS because the `/m11` string-typed schema benefits from an exact type (`Record<m1..m50, "0"\|"1">`). |
| Styling | **Tailwind CSS** | the mandate is a complete UI redesign; utility CSS is the fastest path and carries no design opinion. |
| Backend/data | **Firebase JS SDK (Realtime Database)** against the **existing** `zaem-a8d30` project | preserves the exact contract (§16) with near-zero migration risk; the Android console keeps working untouched. |
| Optional thin backend | **Firebase Functions (Node.js)** — *only if* real auth, rate-limiting, or server-side grid generation is required | adds a controlled write path without running a server; can be introduced later without changing the DB schema. |
| Hosting | **Firebase Hosting** | same project, same console, zero-ops. |
| Not recommended now | Supabase/Postgres, GraphQL, Next.js SSR | would force a data-layer migration and risk breaking the Android compatibility contract for zero functional gain. |

---

## 16. COMPATIBILITY CONTRACT

Everything the future website MUST preserve so the existing ecosystem (this APK, and any unverified second client) keeps working:

1. **Firebase project & DB URL unchanged:** `zaem-a8d30` / `https://zaem-a8d30-default-rtdb.firebaseio.com`.
2. **Node path unchanged:** root child **`m11`**.
3. **Child structure unchanged:** `m11/m1` … `m11/m50` (50 children, exact key names).
4. **Value type & shape unchanged:** each child is an **object** `{"m<N>": "<value>"}` where `<N>` matches the key and `<value>` is the **string** `"0"` or `"1"` (not number, not boolean, not nested further).
5. **Write semantics:** upsert only (`updateChildren` semantics). **Never `remove()`** children or the node — the Android `onChildRemoved` handler ignores removals, and a second client may misbehave; also do not rename/re-type keys.
6. **Event compatibility:** expect that other clients rely on `onChildAdded`/`onChildChanged` per child — write per-row/per-cell granularly (as the APK does) rather than replacing the whole node at once.
7. **No new auth requirement on the DB path:** existing clients are unauthenticated; enabling Firebase Auth/locked rules **will break them** until they are updated. Any web-side auth must live at the app layer, not the DB rules, during transition.
8. **Grid semantics unchanged:** 10 rows × 5 cells, safe-cell curve 1/1/1/1/2/2/2/2/2/4, `"1"`=safe (`poi`), `"0"`=lose (`appleoff`), ladder x1.23→x349.68.
9. **There are no API endpoints to preserve** (none exist) and no deep links/schemes to honor.

---

## 17. TARGET WEB ARCHITECTURE (proposed)

```
                        ┌────────────────────────────┐
   Web Browser ──────►  │  Web SPA (React+TS+Vite)   │
   (operator and/or     │  • login gate (real auth)  │
    players)            │  • grid console + reveal   │
                        └──────────┬─────────────────┘
                                   │  Firebase JS SDK (RTDB)
                                   ▼
                   Firebase Realtime Database  zaem-a8d30
                          node /m11  (UNCHANGED)
                                   ▲
                                   │ Firebase RTDB SDK (unchanged APK)
                        Existing Android console APK
                        (keeps working as-is)

   Optional later: Firebase Functions (auth/roles/audit, server-generated grids)
   1Xbet: EXTERNAL, NOT INTEGRATED (cosmetic branding only — recommend removal)
```

- **Stays:** Firebase RTDB project + `/m11` schema (the entire backend).
- **Reused:** grid-generation algorithm, screen flow, ladder/semantics.
- **Rebuilt:** all UI (full redesign), login (real), reveal choreography (web animations).
- **Removed:** Sketchware runtime, Android permissions, unused libs (Lottie remnants, vid.mp4, unused layouts), test-signing concerns.
- **Net-new (optional):** real accounts, server-side generation, audit log — only if product decisions require.
- **Second app compatibility:** guaranteed by contract §16 (schema-level), but **cannot be tested** until that APK is provided.

---

## 18. MIGRATION ROADMAP

| Phase | Tasks | Dependencies | Risks | Expected output |
|---|---|---|---|---|
| **1 — Audit (CURRENT)** | this document | — | — | approved blueprint |
| **2 — Architecture prep** | product decision on S9 (keep/replace deceptive mechanics, 1Xbet branding, promo code); confirm Firebase project ownership; obtain the second APK; freeze contract §16 | Phase 1 sign-off | **legal/product risk blocks everything** | signed-off target scope + contract |
| **3 — Backend/API prep** | verify current RTDB rules **read-only** from console (no probing); decide auth model (none / Firebase Auth app-layer / Functions); if Functions: implement write gateway | Phase 2, console access | locking rules breaks Android clients | confirmed DB rules + optional Functions |
| **4 — Web foundation** | Vite+React+TS+Tailwind scaffold, Firebase init, routing (3 screens), design system for the **new** UI | Phase 3 | none major | deployable skeleton |
| **5 — Feature migration** | gate screen; grid generator (exact algorithm §10.2); publish to `/m11` (exact writes); live sync listener; reveal animation | Phase 4 | schema drift → enforce via TS types + contract tests | feature-complete web console |
| **6 — Auth + Firebase integration** | real login (if chosen), role model, security review of web-side secrets | Phase 5 | breaking unauthenticated Android access | secured app |
| **7 — UI/UX redesign** | full visual modernization (explicitly NOT copying the Android look); Arabic/RTL if audience requires | Phase 5 | scope creep | redesigned UI |
| **8 — Integration testing** | two browsers + Android APK concurrently mutating/reading `/m11`; verify `onChildAdded/Changed` flows; offline/error states | Phases 5–7 | race conditions on concurrent writes | test report |
| **9 — Compatibility testing (second Android app)** | install player APK, verify it renders web-published grids identically | **second APK must be provided** | unknown contract mismatches | compatibility sign-off |
| **10 — Production deployment** | Firebase Hosting, monitoring, rollback plan, decommission plan for Android console if replaced | 8 (and 9 if applicable) | public-DB abuse continues until rules tightened | live site |

---

## 19. RISKS & BLOCKERS

1. **Legal/ethical (BLOCKER-class):** the app is functionally a random-grid publisher dressed as a "prediction/cheat" tool for a real-money betting platform, using 1Xbet's trademark and a promo-code funnel (see S9, `dialogue.xml`). Building a web replica amplifies exposure. **A product/legal decision is required before Phase 2.**
2. **Public, unauthenticated database:** anyone can read/write `/m11` today; a website makes that URL even more discoverable. Tightening rules breaks existing clients (contract item 7).
3. **Second application unknown:** no APK provided; its expectations are inferred only from `/m11`. Phase 9 is impossible without it.
4. **Firebase ownership unverified:** we cannot confirm the repo owner controls project `zaem-a8d30` (needed for rules, Functions, Hosting).
5. **No server component exists:** if real auth/anti-abuse is required, it is net-new build effort (moderate).
6. Minor: schema fragility (string `"0"/"1"`), duplicate-activity bug in the APK, unused permissions/assets — none block migration.

---

## 20. QUESTIONS REQUIRING CLARIFICATION

### CRITICAL (could block development)
1. Do you **own/control the Firebase project `zaem-a8d30`** (can you open its console)? If not, migration of the data layer is blocked.
2. Where is the **second Android application**? Please provide its APK so the compatibility contract can be verified rather than inferred.
3. **Product/legal decision:** should the website reproduce the current mechanics (random grid presented as "prediction", fake connection dialogs, fake user counters, 1Xbet branding, promo code C7N), or rebuild the same *technology* (grid publisher + realtime sync) with legitimate presentation? We cannot proceed to UI/UX design without this.
4. Who are the web users — the **operators only** (like this APK) or also the **players** (a second, currently-unseen client)?

### IMPORTANT (could affect architecture)
5. Should the website write to `/m11` **directly from the browser** (simplest, keeps APK compat) or through a **gateway** (Functions) that writes identically?
6. Must the DB stay world-readable/writable during transition (contract item 7), or can Android clients be updated/replaced to allow locked rules?
7. Authentication for the web: shared operator secret (as now, but server-checked), individual accounts, or none?
8. Is the entered "Your Id" (1Xbet account id) ever to be stored/associated (privacy implication), or keep display-only?
9. Arabic-first UI (RTL) or English-first for the redesign?

### OPTIONAL (useful, not blocking)
10. Keep the Lottie/animated assets (loader, thank-you) or design new ones?
11. Should round history / timestamps be added (they don't exist today)?
12. Keep the 10 s splash wait and 3 s login delay, or drop artificial delays?

---

## 21. FINAL RECOMMENDATION

Technically this is one of the simplest migrations possible: **a 3-screen Sketchware app whose entire backend is 50 upserts to one Firebase RTDB node.** Build it as a **React + TypeScript + Vite SPA with Tailwind, talking to the existing Firebase RTDB via the JS SDK**, preserving the `/m11` schema exactly (§16); introduce Firebase Functions only if real auth/abuse-control is mandated. Do **not** introduce a new database or REST layer — nothing in the current system justifies it, and it would risk the Android compatibility contract.

However: **do not start Phase 2 until the CRITICAL questions in §20 are answered** — ownership of the Firebase project, the second APK, and — above all — the product/legal decision about what this tool claims to do. The code is trivial; the intent is the risk.

---

# CONCLUSION

**CAN THIS SYSTEM BE MIGRATED TO WEB?**

**YES** — technically, with low effort (3 screens, one Firebase RTDB node, zero APIs to replicate). Conditional on resolving the non-technical blockers below.

**WHAT MUST BE PRESERVED?**
- Firebase project `zaem-a8d30` and RTDB URL;
- node **`/m11`** with children **`m1…m50`**, each an object **`{"mN": "0"|"1"}`** (string values), upsert-only, never removed/renamed/re-typed;
- unauthenticated DB access until all Android clients are updated;
- grid semantics: 10×5, safe-cell curve 1/1/1/1/2/2/2/2/2/4, `"1"`=safe, `"0"`=lose, ladder x1.23→x349.68;
- per-child write granularity (other clients depend on child events).

**WHAT MUST BE REBUILT?**
- The entire UI (full redesign — splash, gate, operator console, reveal animation);
- Authentication (the hardcoded `"MAGIC"` password cannot ship to a browser);
- All choreography (dialogs, toasts, particles) as web animations — with a product decision on the *fake* elements;
- Anything "more" (accounts, history, server-side generation) is net-new, not a migration.

**WHAT IS THE BIGGEST TECHNICAL RISK?**
Not code — **the unverified second application and the unverified Firebase ownership/security rules**: the compatibility contract is inferred from one APK only, and the database is (by inference) publicly writable, so a website both depends on and exposes that openness. (The single biggest *overall* risk is legal/ethical: replicating a betting-"prediction" tool with 1Xbet branding and fake trust signals.)

**WHAT SHOULD WE DO NEXT?**
1. Answer the four CRITICAL questions (§20) — especially the product/legal decision.
2. Provide the second APK and confirm Firebase console access.
3. Export/inspect current RTDB rules and data from the console (no external probing).
4. Then start Phase 2 (architecture prep) with the compatibility contract above frozen as the spec.

---

*End of Phase 1 report. Repository left untouched (no code modified, no commits, no pushes). No secrets reproduced. Unverifiable items explicitly marked UNKNOWN throughout.*

# Project Analysis Report: MAGIC SCRIPT Admin Console & Apple of Fortune

## 1. Project Overview

- **Project Name**: `magic-script-admin-console` (Repository: `magicscript0/magicscript`)
- **Primary Purpose**: Web-based operator command center and player client for the Apple of Fortune game concept, featuring an administrative control plane, visitor security tracking, and a live game display.
- **Tech Stack**:
  - **Framework & Runtime**: React 18.3.1, TypeScript 5.6.3, Vite 5.4.9
  - **Styling**: Tailwind CSS 3.4.13, PostCSS, Autoprefixer, Lucide React icons
  - **Data Layer 1 (Control Plane & Auth)**: Supabase (`@supabase/supabase-js` v2.114.0) — manages admin users, role permissions, public login presentation settings, visitor tracking, security logs, and game access session codes.
  - **Data Layer 2 (Live Game State Bridge)**: Firebase Realtime Database (`firebase` v10.14.1) — reads and updates the real-time `/m11` game matrix node consumed by game clients.
  - **Testing & Tooling**: Vitest 2.1.2, JSDOM, Testing Library, ESLint 8.57.1, PGLite
  - **Deployment**: Vercel (`vercel.json` with SPA rewrite rules)

---

## 2. Repository Structure

```text
C:\projects\magicscript/
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vercel.json
├── vite.config.ts
├── public/
│   └── (static assets, brand marks, icons)
├── scripts/
│   └── audit-firebase.mjs
├── supabase/
│   └── migrations/
│       ├── 20241020000001_admin_control_plane.sql
│       ├── 20241024000001_game_access_system.sql
│       └── 20241026000001_visitor_security_monitoring.sql
└── src/
    ├── App.tsx                        # Master router & view switcher (Public Game vs Admin Console)
    ├── main.tsx                       # Entry point
    ├── components/                    # UI presentation components
    │   ├── ActionButtons.tsx
    │   ├── AdminSidebar.tsx
    │   ├── CyberBackdrop.tsx
    │   ├── FortuneBoard.tsx           # 10x5 Apple of Fortune board renderer
    │   ├── GameBrand.tsx
    │   ├── GameGrid.tsx
    │   ├── GameIntro.tsx
    │   ├── PublicGameHud.tsx
    │   └── VisitorTracker.tsx
    ├── config/                        # Core geometry & config constants
    │   ├── firebase.ts                # RTDB URLs, paths (/m11), fallbacks
    │   ├── game.ts                    # 10x5 grid rules, multipliers, M_KEYS (m1..m50)
    │   └── supabase.ts                # Supabase client bootstrap config
    ├── hooks/                         # Custom reactive hooks
    │   ├── useM11Mirror.ts            # Subscribes to live /m11 snapshot
    │   ├── useFirebaseConnection.ts   # .info/connected probe
    │   └── useLocalClock.ts           # Dynamic time calculation
    ├── layouts/                       # AdminLayout & shared context
    ├── pages/                         # Route view pages
    │   ├── Console.tsx                # Operator round generator & live monitor
    │   ├── Fortune.tsx                # End-user Apple of Fortune game client
    │   ├── GameLogin.tsx              # Player access-code redemption
    │   ├── Login.tsx                  # Supabase Admin login
    │   ├── DashboardPage.tsx          # Metrics & system status
    │   ├── PublicGamePage.tsx         # Presentation settings editor
    │   └── VisitorsPage.tsx           # Visitor analytics & monitoring
    ├── services/                      # Backend integration services
    │   ├── firebase.ts                # Lazy Firebase App/Database initializer
    │   ├── m11.ts                     # subscribeToM11Sync() & publishDemoRound()
    │   ├── supabase.ts                # Supabase client singleton & auth helpers
    │   ├── control.ts                 # Control settings CRUD
    │   ├── gameAccess.ts              # Access code generation and validation
    │   ├── securityMonitoring.ts      # Real-time visitor logs
    │   └── visitorTracking.ts         # Session telemetry
    └── utils/                         # Validation, crypto, generator
        ├── generator.ts               # Apple of Fortune round matrix generator
        ├── m11Snapshot.ts             # Parser from /m11 wire format to 10x5 rows
        └── validation.ts              # Contract validation rules
```

---

## 3. Firebase Usage

### 3.1 Scope & Role
Firebase is used **exclusively as a Firebase Realtime Database (RTDB)** data bus at path `/m11`. No Firestore, Firebase Auth, or Firebase Storage is used in the application.

### 3.2 File Inventory
- `src/config/firebase.ts`: Defines `M11_PATH = 'm11'`, fallback URLs (`https://zaem-a8d30-default-rtdb.firebaseio.com`), and forbidden paths (`main`, `xbetmoney`, `users`, `bet1`, `data`).
- `src/services/firebase.ts`: Initializes the Firebase App with `databaseURL` and exposes `getDemoDatabase()` and `subscribeToConnectionState()`.
- `src/services/m11.ts`:
  - `subscribeToM11Sync(handlers)`: Attaches an `onValue` listener to `/m11`.
  - `publishDemoRound(node)`: Performs atomic `update(ref(database, 'm11'), node)` for the 50 cells.
- `src/hooks/useM11Mirror.ts`: React hook managing connection state and parsing live snapshot evaluations.
- `src/pages/Fortune.tsx` & `src/pages/Console.tsx`: Consume `useM11Mirror()` and invoke `publishDemoRound()`.

### 3.3 Data Shape on Firebase
Firebase stores a flat map of 50 child nodes under `/m11`, where each child contains an identical nested object key:
```json
{
  "m11": {
    "m1": { "m1": "1" },
    "m2": { "m2": "0" },
    "m3": { "m3": "1" },
    "...": "...",
    "m50": { "m50": "0" }
  }
}
```
- Values are string literals: `"1"` (Safe apple) or `"0"` (Broken apple / mine).
- Key distribution:
  - Row 1 (Bottom, ×1.23): `m1` to `m5` (4 safe, 1 broken)
  - Row 2 (×1.54): `m6` to `m10` (4 safe, 1 broken)
  - Row 3 (×1.93): `m11` to `m15` (4 safe, 1 broken)
  - Row 4 (×2.41): `m16` to `m20` (4 safe, 1 broken)
  - Row 5 (×4.02): `m21` to `m25` (3 safe, 2 broken)
  - Row 6 (×6.71): `m26` to `m30` (3 safe, 2 broken)
  - Row 7 (×11.18): `m31` to `m35` (3 safe, 2 broken)
  - Row 8 (×27.97): `m36` to `m40` (2 safe, 3 broken)
  - Row 9 (×69.93): `m41` to `m45` (2 safe, 3 broken)
  - Row 10 (Top, ×349.68): `m46` to `m50` (1 safe, 4 broken)

---

## 4. Supabase Usage

### 4.1 Scope & Role
Supabase acts as the **authoritative relational control plane and administrative data store**.

### 4.2 Tables & Usage
- `admin_users`: Authentication & RBAC (`super_admin`, `admin`, `operator`).
- `admin_activity_logs`: Audit trail of all administrative actions.
- `app_control_settings`: Key-value JSON storage for public login branding, social links, and display options.
- `game_access_codes` & `game_access_sessions`: Player authorization tokens, expiration timestamps, and device binds.
- `visitor_profiles` & `visitor_security_events`: Anti-tampering telemetry, IP/ASN tracking, and anomaly detection.

### 4.3 Authority
- **Supabase is authoritative** for user identity, authentication, permissions, audit history, and configuration.
- **Firebase is a live real-time mirror** solely for distributing the active 50-cell game round.

---

## 5. Apple of Fortune Feature Analysis

### 5.1 Architecture & Components
- **`src/pages/Fortune.tsx`**: Public game interface rendered for authenticated players (who enter an Account ID and Access Code).
- **`src/components/FortuneBoard.tsx`**: Renders the 10 rows × 5 columns ladder grid.
- **`src/utils/generator.ts`**: Implements deterministic/random round generation satisfying row constraints.
- **`src/utils/m11Snapshot.ts`**: Pure functions converting the 50-key Firebase map into typed 10x5 matrix rows (`ConsoleRow[]`).

### 5.2 User Experience Flow
1. **Load / Observation**: When `Fortune.tsx` mounts, `useM11Mirror()` subscribes to `/m11`. If a round exists in Firebase, it maps `values` to `ConsoleRow[]` and displays the board in `ready` state.
2. **"New Game" Button**:
   - Triggers `handleNewGame()`.
   - Generates a fresh 10x5 round via `generateDemoRound()`.
   - Validates node structure via `validateM11Node()`.
   - Pushes update atomically to `/m11` via `publishDemoRound()`.
   - The reactive listener receives the updated node and populates the board.
3. **"Reveal" Button**:
   - Transitions component state to `revealing`.
   - Iteratively increments `revealedRows` with an animated row delay (500ms per row or 80ms for reduced motion).
   - Fully reveals all 10 rows showing which apples are Safe vs. Broken.

---

## 6. Data Flow Diagram

```text
+-------------------------------------------------------------------+
|                        ADMINISTRATOR / OPERATOR                   |
|                        (MagicScript Console)                      |
+-------------------------------------------------------------------+
                               |
                   Generate & Publish Round
                               v
+-------------------------------------------------------------------+
|                   FIREBASE REALTIME DATABASE                      |
|                   Node: https://.../m11                           |
|       { m1: {m1: "1"}, m2: {m2: "0"}, ... m50: {m50: "0"} }      |
+-------------------------------------------------------------------+
             |                                           |
    Realtime onValue Listener                   Realtime onValue Listener
             v                                           v
+-----------------------------+             +-----------------------------+
|    PUBLIC WEB CLIENT        |             |    DEMO MOBILE CLIENT       |
|    (Fortune.tsx)            |             |    (Android APK / WebView)  |
|    - Renders 10x5 ladder    |             |    - Plays live round       |
|    - Animate Reveal         |             |                             |
+-----------------------------+             +-----------------------------+
```

---

## 7. Comparison with labx.site API

### 7.1 Live labx.site Responses

| Endpoint | Method | Live Response Structure |
|---|---|---|
| `https://labx.site/_health` | GET | `{"status":"ok"}` |
| `https://labx.site/_debug/balance` | GET | `{"balance":1960.19}` |
| `https://labx.site/_debug/live-game` | GET | `{"active":false,"message":"Waiting for game to start"}` (or active session details) |
| `https://labx.site/_debug/sessions` | GET | `[{"id":59,"account_id":978866681,"game_id":138,"action_step":7,"bet_sum":10,"win_sum":111.8,"matrix":[[1,1,1,0,1],[1,1,1,1,0],...],"user_picks":[3,4,3,3,3,5,3],"status":2,...}]` |
| `https://labx.site/_debug/payment-settings` | GET | `{"vodafone":{"display_name":"Vodafone Cash","value":"01099998888","enabled":true},...}` |

### 7.2 Data Field Mapping

| MagicScript (Firebase `/m11`) | labx.site (`_debug/sessions` / `_debug/live-game`) | Transformation Required |
|---|---|---|
| Flat map of 50 keys `m1`…`m50` | 2D Array `matrix[10][5]` (`0` and `1` numbers) | Flatten `matrix[row][col]` into `m(row*5 + col + 1)`: `"1"` / `"0"`. |
| Nested `{ m1: { m1: "1" } }` | Matrix integer `1` (Safe) or `0` (Broken) | Wrap `matrix[r][c] === 1 ? "1" : "0"` into `{ [key]: val }`. |
| Payout row multipliers (`config/game.ts`) | Row multipliers (1.23 to 349.68) | Identical geometry and curve (10 rows, 5 cols). |
| Static round without user picks | Active round + `user_picks` history | `labx.site` includes live pick telemetry for stepping through rounds. |

### 7.3 Capability Gaps & Requirements
- **Push vs. Poll**: Firebase provides WebSocket-based push subscriptions (`onValue`). `labx.site` is currently an HTTP REST API, so the web client will either poll `https://labx.site/_debug/live-game` (e.g. every 1–2s) or use Server-Sent Events / WebSockets if added to `labx.site`.
- **CORS**: `https://labx.site` must return `Access-Control-Allow-Origin: *` to allow the Vercel-hosted React web application to fetch API data directly.

---

## 8. Recommended Integration Strategy

### Evaluation of Options
- **Option A (Full Replacement)**: Replace Firebase entirely with `labx.site` API calls.
  - *Feasibility*: High.
  - *Design Impact*: None (UI components consume abstracted hooks).
  - *Code Change*: Small (only adapt `src/hooks/useM11Mirror.ts` and `src/services/m11.ts`).
  - *Risk*: Low.
- **Option B (Hybrid / Dual Source)**: Support both Firebase and `labx.site` via an environment variable switch (`VITE_GAME_DATA_SOURCE=labx|firebase`).
  - *Feasibility*: Excellent.
  - *Design Impact*: Zero.
  - *Code Change*: Minimal. Preserves existing test suite and offline demo mode while allowing seamless connection to `labx.site`.

### Recommendation: **Option B (Configurable Data Provider with Dual Support)**
Create an adapter in `src/services/m11.ts` (or `src/services/labx.ts`) that implements the `M11SyncHandlers` interface by polling or listening to `https://labx.site/_debug/live-game` or `https://labx.site/_debug/sessions`.

---

## 9. Files That Must Be Modified (When Implementing)

1. **`src/services/m11.ts`** (or a new `src/services/labx.ts`):
   - Add a fetch/polling provider for `https://labx.site/_debug/live-game` and `_debug/sessions`.
   - Map `matrix[10][5]` to `M11Node` (`m1`..`m50`).
2. **`src/hooks/useM11Mirror.ts`**:
   - Allow switching provider source between Firebase RTDB and `labx.site`.
3. **`src/config/firebase.ts` / `.env.example`**:
   - Add `VITE_LABX_API_URL=https://labx.site`.
4. **`src/vite-env.d.ts`**:
   - Add TypeScript type definitions for `VITE_LABX_API_URL`.

---

## 10. Files That Must NOT Be Modified

- **All Visual Components & Styling**:
  - `src/pages/Fortune.tsx` (Layout and presentation)
  - `src/components/FortuneBoard.tsx` (Board grid and animations)
  - `src/components/CyberBackdrop.tsx`, `src/components/GameBrand.tsx`, `src/components/PublicGameHud.tsx`
  - `src/index.css`, `tailwind.config.js`
- **Supabase Control Plane**:
  - `src/services/supabase.ts`, `src/services/control.ts`, `src/services/gameAccess.ts`, `src/services/visitorTracking.ts`
  - Database migrations in `supabase/migrations/`

---

## 11. Risks and Rollback Plan

- **Risk 1: CORS Block on Browser Requests**: If `labx.site` does not set `Access-Control-Allow-Origin: *`, browser requests from `localhost` or `magicscriptvip.vercel.app` will fail.
  - *Mitigation*: Ensure Nginx on the VPS (`labx.site`) includes standard CORS headers for API routes.
- **Risk 2: Polling Latency vs Push**: Polling at 1000ms creates a slight delay compared to Firebase WebSockets.
  - *Mitigation*: Configure short polling (750ms–1000ms) or implement an SSE endpoint on `labx.site`.
- **Rollback**: Because changes are isolated to the service/hook adapter, reverting is as simple as flipping `VITE_GAME_DATA_SOURCE=firebase` or git checkout.

---

## 12. Next Steps

1. **Verify CORS on labx.site**: Ensure `https://labx.site/_debug/*` headers include `Access-Control-Allow-Origin: *`.
2. **Implement Labx Adapter Service**: Create `src/services/labx.ts` with matrix-to-`M11Node` transformation and live session polling.
3. **Wire into `useM11Mirror`**: Connect the hook to automatically use `labx.site` when configured.
4. **Validate**: Run `npm test`, `npm run typecheck`, and `npm run build` to confirm zero regression.

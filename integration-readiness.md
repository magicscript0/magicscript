# labx.site Integration Readiness Report

## 1. Executive Summary

The `magicscript` React project is fully verified and ready for the `labx.site` API integration. All endpoints on `https://labx.site` are live, reachable, and correctly configured with CORS (`Access-Control-Allow-Origin: *` and preflight support). The data structures between `labx.site`'s 10x5 matrix array and `magicscript`'s `/m11` 50-key map have exact mathematical parity. The proposed dual-source architecture allows switching between Firebase and `labx.site` via an environment flag while preserving 100% of the UI design, Supabase auth/control plane, and existing test suites.

---

## 2. magicscript Project State

- **Local Path**: `C:\projects\magicscript`
- **Dependencies Installed**: YES (`node_modules` present, `npm ci` clean)
- **Git Status**: Clean on branch `main` (up to date with `origin/main`)
- **Latest Commit**: `6b5e9fe Merge pull request #12 from magicscript0/arena/01a096c2-magicscript`
- **Build Status**: Verified (`tsc --noEmit && vite build` completes in ~5s with 0 errors)
- **Environment Configuration**: `.env.example` present; `.env` file to be created for local dev

---

## 3. labx.site API State

- **Endpoints Reachable**: YES
  - `GET https://labx.site/_health` → `200 OK` (`{"status":"ok"}`)
  - `GET https://labx.site/_debug/balance` → `200 OK` (`{"balance":1950.19}`)
  - `GET https://labx.site/_debug/live-game` → `200 OK` (active game details & matrix)
  - `GET https://labx.site/_debug/sessions` → `200 OK` (historical session array)
  - `GET https://labx.site/_debug/payment-settings` → `200 OK` (configured payment methods)
- **CORS Enabled**: YES
  - `Access-Control-Allow-Origin: *` returned on all GET/POST requests.
  - `OPTIONS` preflight tested with Origin `https://magicscriptvip.vercel.app`: returns `HTTP 204 No Content` with `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`.
- **Data Shape Confirmed**: YES
- **Sample Response (`_debug/live-game`)**:
  ```json
  {
    "active": true,
    "session_id": 65,
    "account_id": 978866681,
    "bet_sum": 10,
    "win_sum": 0,
    "current_row": 0,
    "user_picks": [],
    "total_rows": 10,
    "cols_per_row": 5,
    "matrix": [
      [1, 1, 1, 1, 0],
      [1, 0, 1, 1, 1],
      [1, 0, 1, 1, 1],
      [1, 1, 0, 1, 1],
      [1, 0, 1, 1, 0],
      [0, 0, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 0, 0, 0, 1]
    ],
    "recommended_next": { "row": 0, "cols": [0, 1, 2, 3] }
  }
  ```

---

## 4. Data Flow Analysis

### Current Source (Firebase RTDB `/m11`)
- WebSocket listener `onValue(ref(db, 'm11'))` emits snapshot:
  ```json
  {
    "m1": { "m1": "1" },
    "m2": { "m2": "0" },
    "...": "...",
    "m50": { "m50": "0" }
  }
  ```

### Target Source (`labx.site` `_debug/live-game`)
- Polling HTTP client retrieves `matrix[10][5]`:
  - Row index `0` represents Row 1 (Bottom, m1..m5)
  - Row index `9` represents Row 10 (Top, m46..m50)

### Transformation Function
```typescript
export function transformLabxMatrixToM11Node(matrix: number[][]): M11Node {
  const node: Record<string, { [k: string]: string }> = {}
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 5; c++) {
      const key = `m${r * 5 + c + 1}`
      const val = matrix[r]?.[c] === 1 ? '1' : '0'
      node[key] = { [key]: val }
    }
  }
  return node as unknown as M11Node
}
```

---

## 5. Blockers & Risks

| Category | Item | Severity | Status & Action |
|---|---|---|---|
| CORS | Cross-origin headers on `labx.site` | INFO | Resolved. `*` wildcard and OPTIONS preflight are functional. |
| SSL / HTTPS | Certificate validity | INFO | Resolved. Valid Let's Encrypt certificate on `labx.site`. |
| Data Model | Grid dimensions & multiplier ladder | INFO | Resolved. Identical 10x5 curve (1.23 to 349.68). |
| Deployment | `magicscriptvip.vercel.app` status | WARNING | Currently returns `DEPLOYMENT_NOT_FOUND` on Vercel. Requires linking GitHub repository in Vercel dashboard. |

---

## 6. Implementation Plan

### Phase 1 — Environment Configuration & Types
- Update [.env.example](file:///C:/projects/magicscript/.env.example):
  ```env
  VITE_GAME_DATA_SOURCE=labx
  VITE_LABX_API_URL=https://labx.site
  ```
- Update [src/vite-env.d.ts](file:///C:/projects/magicscript/src/vite-env.d.ts):
  - Add type definitions for `VITE_GAME_DATA_SOURCE` and `VITE_LABX_API_URL`.

### Phase 2 — Create Labx Adapter Service
- Create `src/services/labx.ts`:
  - Define `subscribeToLabxSync(handlers: M11SyncHandlers, pollIntervalMs = 1000): Unsubscribe`.
  - Fetch `https://labx.site/_debug/live-game`.
  - When `active: true` and `matrix` is present, transform `matrix[10][5]` into `M11Node` and evaluate via `evaluateM11Snapshot(node)`.
  - When `active: false`, emit `empty` status.
  - Implement `publishLabxRound(node: M11Node)` (if remote creation endpoint is needed, otherwise trigger `MakeBetGame`).

### Phase 3 — Update useM11Mirror Hook
- Update [src/hooks/useM11Mirror.ts](file:///C:/projects/magicscript/src/hooks/useM11Mirror.ts):
  - Read `VITE_GAME_DATA_SOURCE` (`'labx'` vs `'firebase'`).
  - Route subscription through `subscribeToLabxSync()` when in `'labx'` mode, preserving `subscribeToM11Sync()` when in `'firebase'` mode.
  - Zero changes to consumer components (`Fortune.tsx`, `Console.tsx`, `FortuneBoard.tsx`).

### Phase 4 — Validation & Testing
- Run TypeScript typecheck: `npm run typecheck`
- Run linter: `npm run lint`
- Run automated unit tests: `npm test`
- Run local development server: `npm run dev` and verify live updates in browser against `labx.site`.

### Phase 5 — Deployment Preparation
- Verify build: `npm run build`
- Present git diff and staging summary for review before commit/push.

---

## 7. Rollback Plan

- **Instant Zero-Code Rollback**: Set `VITE_GAME_DATA_SOURCE=firebase` in `.env` or Vercel Environment Variables.
- **Git Revert**: Reverting the adapter commit cleanly restores the original Firebase-only service path.

---

## 8. Recommendation

- **Proceed**: YES — Environment, API endpoints, CORS, and data contracts are verified.
- **Estimated Implementation Time**: ~15–20 minutes.
- **Next Step**: Awaiting operator approval to begin Phase 1.

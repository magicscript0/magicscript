# Visitor & Security Monitoring Center — Implementation Report

Date: 2026-09-12
Branch: `arena/01a096c2-magicscript` (commit `d9f380a`)
Scope: 32 files changed (22 added, 10 modified), +4,601 / −7 lines.

The existing MAGIC SCRIPT admin dashboard gained a native **Monitoring** section with three
pages — Visitors, Auth activity, and Security alerts — built on a dedicated, privacy-safe
audit layer in Supabase. Nothing was forked: the system instruments the existing Supabase
auth, Game Access, and routing flows, and the Firebase `/m11` contract is untouched.

---

## 1. Migration added

**`supabase/migrations/20260912000000_visitor_security_monitoring.sql`** (single new migration,
follows the repository's `YYYYMMDDHHMMSS_name.sql` convention; no existing migration edited):

| Object | Purpose |
| --- | --- |
| enums `visitor_device_type`, `security_event_type`, `security_event_result`, `security_severity` | Typed vocabularies (`normal < warning < suspicious < high_risk`). |
| table `visitor_sessions` | One row per pseudonymous visitor/session: `visitor_key`, optional `user_id`, first-seen/last-active, session & login counters, failed-attempt counter, device class/OS/browser, approximate country, referrer host, current page, presence state. **No password/token/cookie/secret/raw-IP columns exist.** |
| table `security_events` | Audit log: event type, visitor key, optional user id, game account id, result, whitelisted failure reason, severity, country, device meta, timestamps. Constraints: `reason` CHECK whitelist, `game_account_id ~ '^[0-9]{9,11}$'`, `country_code ~ '^[A-Z]{2}$'`, length caps. |
| function `track_visitor_activity(...)` | `SECURITY DEFINER` — the **only** browser write path. 12 parameters, none secret. Validates/normalizes everything server-side: event-type whitelist, reason whitelist per event type, path whitelist (`/`, `/play`, `/admin`, `/game`…), `result` **derived from the event type** (clients cannot claim results), `p_user_id` stored only when it equals `auth.uid()`, length caps, country normalization. Upserts the session, bumps counters, dedupes informational repeats (15 s presence-family window), and computes severity from rolling failure windows. |
| function `visitor_heartbeat(...)` | Throttled (≥20 s server-side) presence refresh → `online`/`recent` transitions. |
| function `prune_security_monitoring(days_to_keep)` | Retention cleanup (7–365 days), requires `has_admin_role('admin')`, returns deleted counts. |
| severity scoring | Visitor failures: 2–3 `warning`, 4–9 `suspicious`, ≥10 `high_risk`. Per-account: 3–4 / 5–9 / ≥10. Auth-wide: ≥20 failures/15 min `suspicious`, ≥40 `high_risk`. Any event: ≥30/5 min `suspicious`, ≥60 `high_risk`. **A single failed attempt is never an attack.** |
| indexes | `visitor_sessions(last_active_at DESC)`, `(presence_state)`, `security_events(created_at DESC)`, `(visitor_key, created_at DESC)`, `(event_type, created_at DESC)`, `(severity)`, partial index on failures. |
| RLS | Both tables: `SELECT` requires `has_admin_role('admin')` (super_admin/admin; **operators excluded**). **No INSERT/UPDATE/DELETE policies at all** for browser roles — writes only through the definer RPCs. `service_role` retains full access. |
| realtime | Both tables added to the `supabase_realtime` publication inside a guarded DO block (idempotent). |

## 2. Files changed

### Added — client source (11)
- `src/services/visitorIdentity.ts` — pseudonymous visitor/session keys (`crypto.randomUUID`,
  localStorage/sessionStorage, StrictMode-safe, no cross-device identity).
- `src/services/visitorTracking.ts` — fail-safe fire-and-forget recorders
  (`recordAdminLoginSuccess/Failure`, `recordAdminLogout`, `recordGameLoginSuccess/Failure`,
  `recordGameAccessAttempt`, `recordGameLogout`, `recordVisitorHeartbeat`, `trackSecurityEvent`);
  path sanitizer; 30 s client-side info-event dedupe; 2 min heartbeat throttle.
- `src/services/securityMonitoring.ts` — admin-only monitoring queries (session list, event log,
  alert grouping, metrics) + realtime subscriptions; search-term sanitizer.
- `src/hooks/useMonitoringFeed.ts` — shared data hook: initial load, Supabase Realtime
  subscription with **debounced silent reload (1.2 s)**, manual refresh, no aggressive polling.
- `src/components/VisitorTracker.tsx` — renderless component: session start once per load,
  page views on major route milestones only, visibility-gated throttled heartbeat.
- `src/utils/deviceMeta.ts` — user-agent → device type/OS/browser, country normalization,
  referrer host extraction (host only, never full URLs).
- `src/utils/approximateLocation.ts` — approximate country resolved **locally from the browser
  timezone** (IANA zone → ISO-2 map via `Intl`); returns `null` when ambiguous. Zero network.
- `src/pages/VisitorsPage.tsx` — summary cards (online, active sessions, visitors today,
  successful/failed logins), filterable session table (time range/country/device/status/search),
  chronological per-visitor timeline, live updates.
- `src/pages/AuthActivityPage.tsx` — authentication event log with filters (event type, result,
  country, device, time range, suspicious-only) + outcome cards.
- `src/pages/SecurityAlertsPage.tsx` — severity cards, visitors grouped by server-assigned
  severity with failure reasons and targeted accounts, per-account rollups, explicit threshold
  documentation, retention prune action (ConfirmDialog + toast + activity-log audit entry).

### Added — tests (11)
- `src/test/visitorSecuritySql.integration.test.ts` (26 tests, PGlite: executes the real
  migration and asserts schema, constraints, RPC behavior, dedupe, severity scoring, RLS
  outcomes for anon/authenticated/admin/operator/service roles, privacy, retention, realtime).
- `src/services/visitorTracking.test.ts` (16), `src/services/securityMonitoring.test.ts` (14),
  `src/utils/deviceMeta.test.ts` (11), `src/test/monitoring-navigation.test.tsx` (9),
  `src/services/visitorIdentity.test.ts` (8), `src/pages/SecurityAlertsPage.test.tsx` (8),
  `src/pages/VisitorsPage.test.tsx` (6), `src/components/VisitorTracker.test.tsx` (5),
  `src/pages/AuthActivityPage.test.tsx` (4), `src/utils/approximateLocation.test.ts` (3).

### Modified (10)
- `supabase/…` none — existing migrations untouched.
- `src/App.tsx` — routes + `ROUTE_PERMISSIONS` (`security.view`) + legacy hash routes for
  `#/visitors|#/auth|#/alerts`; Console `handleLogin` instrumented (records outcome & error
  category, rethrows unchanged); `<VisitorTracker/>` mounted.
- `src/hooks/useAdminSession.ts` — admin login success/failure and logout instrumented
  (fire-and-forget; error **kind** only, never credentials).
- `src/hooks/useGameAccess.ts` — expired/revoked access attempts and voluntary game logout
  instrumented; network-verification failures deliberately record **nothing** (not an attack
  signal).
- `src/hooks/usePageRoute.ts` — `visitors | auth | alerts` routes.
- `src/components/AdminSidebar.tsx` — MONITORING group (Visitors, Auth, Alerts), gated by
  `security.view` permission.
- `src/components/AdminTopbar.tsx` — page titles for the three routes.
- `src/utils/permissions.ts` / `.test.ts` — new `security.view` permission: `super_admin` +
  `admin` only; operator explicitly denied (2 new tests).
- `src/types/supabase.ts` — typed `Database` interface extended with the new enums, tables,
  and RPC signatures.
- `README.md` — schema/RLS/structure lists updated + dedicated “Visitor & Security Monitoring
  Center” section.

## 3. Privacy protections

- **Never stored, never sent, never displayed:** passwords, submitted access codes, password
  attempts, auth tokens, cookies, session secrets, credentials. Failed logins record only the
  outcome and a whitelisted **reason** (`invalid_credentials`, `network`, `rate_limited`, …).
  The RPC signature has no secret parameter, so a malicious client cannot smuggle one in.
- **No raw IPs anywhere** — not in tables, not in RPC parameters, not in the UI. Approximate
  country only, resolved client-side from the timezone (no geo-IP service, no extra network
  request, no server-side IP logging by this feature).
- Referrer stored as **host only**; paths restricted to a whitelist; user-agent reduced to
  device class/OS/browser strings with length caps.
- Visitor identity is a random pseudonymous key per browser session — no cross-device tracking,
  no PII linkage beyond the existing Supabase `auth.uid()` when an admin is signed in.
- Retention: `prune_security_monitoring` deletes expired events and idle sessions (7–365 days,
  admin-only); exposed in the UI behind a confirmation dialog.
- Integration tests assert the schema contains no secret/IP columns and that RPC payloads
  with secret-like values are rejected or ignored.

## 4. RLS & admin authorization (server-side, not client trust)

- Browser roles have **zero** direct write policies on the audit tables — all writes pass
  through `SECURITY DEFINER` RPCs that re-validate every field and derive `result`/`severity`
  themselves; `p_user_id` is honored only when it equals `auth.uid()`.
- Reads require `has_admin_role('admin')` via RLS → super_admin/admin only; **operators are
  denied by the database** even if a client tried to bypass the UI.
- UI mirrors the rule (`security.view` permission, hidden sidebar entries, NotAuthorized page,
  hash-route guard) but never relies on it — every page test and the SQL integration tests
  verify the server-side denial independently.
- Monitoring data is unreachable from public routes; the public game and login screens render
  nothing from these tables.

## 5. Fail-safe monitoring

- Every recorder is fire-and-forget with internal try/catch — an RPC failure, an unconfigured
  Supabase client, or a thrown error inside tracking **can never break or delay a login**.
  `handleLogin` rethrows the original error unchanged; existing login behavior and messages are
  byte-identical.
- Network failures during session verification record nothing (avoids false “attack” noise).
- Tests cover: RPC error swallowing, unconfigured-client no-ops, heartbeat no-ops, and that no
  direct network calls are made by the tracking layer.

## 6. Performance

- Writes only for meaningful events: session start (once per load), page views on the four
  major routes (30 s client dedupe + 15 s server dedupe), heartbeats ≤ every 2 min while the
  tab is visible (server enforces ≥20 s), and actual auth outcomes. **No writes for ordinary UI
  interactions** — filtering, sorting, tab switches, and table browsing are purely local.
- Reads: one indexed, capped query per page + Supabase Realtime subscription; inserts trigger a
  **debounced (1.2 s) silent reload** instead of polling. Manual refresh remains available.

## 7. Firebase safety confirmation

- `src/services/m11.ts` remains the only Firebase write path; the guard suite
  (`src/services/m11.test.ts`) and `npm run audit:firebase` pass **unmodified** — the monitoring
  code contains no `fetch(`, no Firebase mutation primitives, no REST write methods (verified
  statically by the existing repo guard and confirmed by the audit script output:
  “No Firebase mutation primitives or legacy Android write APIs elsewhere in src”).
- The monitoring layer talks exclusively to Supabase. `/m11`, `m1…m50`, APP2, prediction/game
  generation, the game board, Game Access lifecycle, Public Game, Supabase auth, existing RLS,
  and the existing dashboard are functionally untouched (all pre-existing tests still pass).
- An earlier prototype used a Vercel edge geo endpoint (`api/geo.ts` + `vercel.json` rewrite);
  it was **removed** to keep the codebase 100 % compliant with the repository's static
  write-audit. `vercel.json` is byte-identical to the baseline.

## 8. Verification results (all green)

| Command | Result |
| --- | --- |
| `npm run typecheck` | ✅ pass |
| `npm run lint` (`--max-warnings 0`) | ✅ pass, 0 warnings |
| `npm test` | ✅ **47 files / 436 tests passed** (pre-change baseline: 36 files / 325 tests; monitoring adds 110 tests in 11 new files + 2 new permission cases) |
| `npm run build` | ✅ Vite production build succeeds (1,703 modules) |
| `npm run audit:firebase` | ✅ pass (fixed path `/m11`, children `m1…m50`, single guarded writer) |
| `git diff --check` | ✅ clean |

Notable suites: `visitorSecuritySql.integration.test.ts` executes the real migration in PGlite
(26/26) including RLS role matrices and privacy assertions; the existing `gameAccessSql` and
`m11` guards remain green.

## 9. Manual deployment / migration steps

1. **Apply the migration** (once, against the project's Supabase database):
   ```bash
   supabase db push            # CLI linked to the project, or
   supabase migration up       # local stack
   ```
   or paste `supabase/migrations/20260912000000_visitor_security_monitoring.sql` into the
   Supabase SQL editor and run it. It is idempotent (`IF NOT EXISTS` / guarded DO blocks) and
   does not modify any existing table.
2. **Environment**: no new environment variables, edge functions, or secrets are required.
   Existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are sufficient (anon role can
   execute the tracking RPCs; reads stay RLS-protected).
3. **Deploy the app** as usual (`npm run build` → hosting). `vercel.json` is unchanged.
4. **Realtime**: nothing to configure — the migration adds the tables to
   `supabase_realtime` automatically. If the project enforces authorized-realtime per-channel
   filters, admin subscribers already satisfy RLS.
5. **Retention (recommended cron)**: schedule `select prune_security_monitoring(90);`
   (7–365) via `pg_cron`/Supabase scheduled jobs, or run it manually from
   Dashboard → Monitoring → Security alerts → “Clean up old data”.
6. **Verify after deploy**: sign in as super_admin/admin → Monitoring group visible with real
   rows after a page visit; sign in as operator → group hidden and `#/visitors` denied;
   a failed Console login appears in Auth activity with reason `invalid code` and no secret
   data anywhere in the row.

## 10. What was deliberately NOT built

- No second login/auth system, no second Game Access system, no duplicate Supabase services.
- No automated bans/blocks — severity flags patterns for human review only; thresholds are
  documented in the UI and a single failure never triggers an alert.
- No raw IP storage, geo-IP calls, fingerprinting, or cross-device identity.
- No dashboard-summary duplication: the monitoring pages carry their own live cards; the
  existing simulated “online counter” display setting remains a display value only.

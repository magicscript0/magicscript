# MAGIC SCRIPT Supabase Integration Verification

**Verification date:** 2026-09-02
**Branch:** `arena/01a0636a-magicscript`
**Scope:** Supabase control-plane audit and completion, with the existing Firebase `/m11` bridge kept intact.

## Result

The application code is now wired for Supabase Auth and the typed Supabase control plane. Configuration, Auth, profile, session, role, network, and database/RLS failures are converted into safe diagnostics and surfaced by the login, session, shell, and data-management surfaces.

Static/local verification is clean. Live Supabase Auth, RLS, migration execution, and an end-to-end database read/write could not be independently exercised in this workspace because no usable `VITE_SUPABASE_PUBLISHABLE_KEY` was available and the supplied endpoint was not reachable from the sandbox. No key was invented, recovered, printed, or committed.

## Audit findings before the change

- The browser already used a Supabase client with `VITE_SUPABASE_URL` and a publishable-key variable, but missing configuration and request failures collapsed into generic messages.
- The intended Auth flow was present: `signInWithPassword`, lookup by the Auth UUID in `public.admin_users`, active-profile enforcement, and sign-out for unauthorized profiles. The session hook did not expose the reason for a missing/inactive profile, a session failure, or an RLS/database failure.
- The migration already modeled `super_admin`, `admin`, and `operator`; no duplicate first-admin/bootstrap path was present.
- The service layer covered `admin_users`, `admin_codes`, `site_settings`, `social_links`, `display_settings`, `activity_logs`, and `round_history`. The manually maintained database types match those tables and the `consume_admin_code` function.
- The notification UI is presentation-only: the announcement comes from `site_settings`, and action feedback is in-memory. The executed schema has no `notifications` table, so there was no persisted notification feature to wire or falsely claim.
- Firebase remained a separate game/demo bridge. `src/services/m11.ts` was the only Firebase writer and was not changed.

## Changes made

### Supabase configuration and security

- Kept the browser contract limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Added a browser key guard that rejects explicit secret/service-role formats and legacy JWTs whose role is `service_role` or `supabase_admin` before `createClient` receives them.
- Created the ignored local `.env` with the supplied Supabase URL and an intentionally empty publishable-key value. The missing key is not exposed in this report or source control.
- Set `supabase/config.toml` to the project ref derived from the supplied URL; no credential was added.
- Kept `SUPABASE_SERVICE_ROLE_KEY` confined to `supabase/functions/redeem-admin-code/index.ts`, where it is read only from the Edge Function runtime.

### Auth, session, and authorization

- Added typed `SupabaseIntegrationError` categories for:
  - missing/invalid configuration;
  - invalid credentials;
  - unconfirmed email;
  - rate limiting;
  - missing admin profile;
  - inactive admin profile;
  - insufficient role;
  - database/RLS denial;
  - expired/invalid session;
  - network failure; and
  - unknown Auth failure.
- `signInAdmin` now:
  1. calls Supabase Auth email/password login;
  2. takes `data.user.id` as the Auth UUID;
  3. queries `public.admin_users` by that exact UUID;
  4. requires a matching `active = true` profile; and
  5. signs out the Auth session when the profile is missing, inactive, or cannot be safely loaded.
- `createClient` retains `persistSession`, `autoRefreshToken`, and URL-session detection.
- `useAdminSession` restores the persisted session, defers Auth work from `onAuthStateChange`, prevents stale refresh results from winning, and passes safe diagnostics into the login surface.
- Logout/session failures are now visible in the authenticated shell rather than being silently dropped.
- The unauthorized route message names the current role and explains that access is enforced again by Supabase RLS.
- Production login is Supabase Auth-only. The old demo-password login seam, old login branding, and related dead validation code were removed. The local game visualization remains supported and clearly labeled as non-real-money functionality.

### Supabase services and control data

All browser Supabase request failures are classified before reaching the UI. The following paths were reviewed against the migration and use typed projections/inputs:

| Control data | Browser behavior | Authorization alignment |
|---|---|---|
| `admin_users` / profile | Auth UUID lookup; profile identity/status used by the shell | Own profile read; roster management remains `super_admin`-only in RLS |
| roles | `super_admin`, `admin`, `operator` are shared by types, UI permissions, and migration enums | UI hides routes; RLS remains authoritative |
| `admin_codes` | Hash generation, safe inventory projection, create, activate/deactivate, revoke, and delete | Admin management; `super_admin`-only delete and escalation to `super_admin` |
| `site_settings` | General identity, browser title, announcement, maintenance flag | Public rows readable as configured; writes require active admin role and actor UUID |
| `social_links` | Singleton Telegram/YouTube read and upsert | Public read; admin insert/update; browser delete removed |
| `display_settings` | Singleton display counter read and upsert | Public read; admin insert/update; browser delete removed |
| `activity_logs` | Append and newest-first read; metadata is non-secret | Append-only policy; actor must equal `auth.uid()` |
| `round_history` | Non-sensitive operational metadata append/read | Append-only policy; actor must be the authenticated user or null |
| notifications | Announcement and transient in-memory toasts only | No `notifications` table exists in the migration; no fake persistence was introduced |

Added `supabase/migrations/20260902000001_magic_script_least_privilege_grants.sql` to narrow anonymous public-read columns, remove browser deletes for singleton public settings, and limit browser insert columns for append-only audit/history records. No database schema type changes were needed; `src/types/supabase.ts` remains aligned with both migrations.

Activity and history recording no longer fail silently: a successful Firebase operation remains successful, while a failed Supabase metadata record produces a safe control-plane warning.

## First-admin/manual deployment action

This remains intentionally out-of-band and does not add bootstrap code:

1. Supply the Supabase **publishable** key through the deployment environment as `VITE_SUPABASE_PUBLISHABLE_KEY`; do not place a service-role/secret key there and do not commit the environment file.
2. Apply the base control-plane migration and the least-privilege follow-up migration to the target project.
3. Create and confirm the intended Supabase Auth user through a trusted administrative channel.
4. From a trusted SQL session, insert the user into `public.admin_users` using the exact Auth UUID, with `role = 'super_admin'` and `active = true`. The user's password is never part of this SQL step.
5. Configure the deployed Auth redirect URLs. Deploy the optional `redeem-admin-code` Edge Function only if code redemption is required; its service credential must remain an Edge Function secret.

No credentials were requested from the user, guessed, or added to the repository.

## Firebase/App 2 preservation audit

The requested Firebase contract remains unchanged:

- existing Firebase project/configuration contract remains in place;
- fixed path `/m11`;
- exactly `m1` through `m50`;
- each child remains `{ "mN": "0" }` or `{ "mN": "1" }` with string values;
- one centralized atomic `update()` writer in `src/services/m11.ts`;
- no writes to `/main`, `/xbetmoney`, `/users`, `/bet1`, or `/data`;
- read-only listener behavior remains in `useM11Mirror`; and
- APP 2/APK/listener behavior was not changed.

`src/pages/Console.tsx` received only control-plane diagnostic and truthful disclaimer improvements; it does not import or call Firebase mutation APIs directly. The static audit still reports one Firebase SDK mutation and one explicit publisher caller.

## Verification performed

| Command/check | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** with zero warnings |
| `npm test` | **PASS** — 17 test files, 148 tests |
| `npm run audit:firebase` | **PASS** — one `update()` in `src/services/m11.ts`, one explicit NEW GAME caller, fixed `/m11`, `m1`–`m50` |
| `npm run build` | **PASS** — production Vite build completed |
| `git diff --check` | **PASS** |
| Local Vite preview root request | **PASS** — HTTP 200; preview server bound to all interfaces |
| Supabase endpoint probe without credentials | **BLOCKED** — sandbox TLS/network returned `SSL_ERROR_SYSCALL` / HTTP 000; no Auth or database request was attempted with a guessed key |

The Supabase CLI is not installed in this workspace, so migration application and generated-type retrieval could not be performed locally. The SQL files were statically reviewed for table names, enum names, grants, policies, helper functions, and service projections.

## Remaining external checks

The implementation is ready for deployment configuration, but the following require the target Supabase project and a real authenticated test account:

- apply/confirm both migrations;
- verify Auth email confirmation and redirect settings;
- provision the first exact-UUID `super_admin` profile;
- test successful sign-in and persisted-session reload;
- test invalid credentials, unconfirmed email, missing profile, inactive profile, expired session, insufficient role, and RLS denial;
- verify CRUD/append behavior for every control-data row in the table above; and
- optionally deploy and exercise the Edge Function with its runtime-only service credential.

Responsive layout constraints remain mobile-first for approximately 320/375/390/430px, tablet, and desktop widths, with contained tables and a touch-usable five-column game grid. Pixel-level screenshots and real-device touch testing were not available in this sandbox; the production build and existing responsive component/test coverage passed.

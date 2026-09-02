# MAGIC SCRIPT Admin Console

MAGIC SCRIPT is a dark, mobile-first operations console for the existing game visualization workflow.

The application deliberately keeps two backends separate:

```text
MAGIC SCRIPT UI ── Supabase ── administration, Auth, roles, settings, codes, logs, history
              └─ Firebase /m11 ── existing realtime round bridge ── APP 2 (unchanged)
```

Supabase never replaces Firebase. The existing Firebase project, `/m11` path, 50-child payload, and APP 2 consumer contract remain intact.

## Two products, one application

The repository hosts two completely separate experiences:

| Experience | Entry | Auth |
| --- | --- | --- |
| **MAGIC SCRIPT — Apple of Fortune** (end users) | `/` → Game Login → `/play` | Account ID (9–11 digits) + time-bound Access Code |
| **MAGIC SCRIPT — Admin Dashboard** (administrators) | `/login/admin` → `/admin` | Existing Supabase Auth (`admin_users`, roles, `active`, RLS) |

- `/` shows the Apple of Fortune game login — never the admin dashboard.
- `/play` is guarded by a server-validated game session; missing/expired/revoked sessions redirect to the game login. Refreshing only restores access while the server confirms the session.
- `/login/admin` is the Supabase email/password screen; `/admin` renders the existing dashboard (workspace sections keep their `#/section` hash routing). Old `/#/section` bookmarks are forwarded into `/admin`.
- Access Codes are created in the dashboard under **Game Access**: duration presets (15 min – 24 h or custom), one-time copy, created/expires/status/uses visibility, last Account ID, and revocation. Revoking a code cuts off its active sessions at their next server check (≤ 30 s heartbeat).
- The game UI exposes no control-plane terminology: no Firebase/Supabase/diagnostics text, only the game itself.

Game access is enforced server-side by the migration `supabase/migrations/20260902000002_game_access.sql`:

- `game_access_codes` — SHA-256 hashes only, duration, server-computed `expires_at`, revocation, usage, last Account ID.
- `game_access_sessions` — opaque bearer tokens (SHA-256 hashes only) bound to a code's expiry.
- `redeem_game_access` / `check_game_access` — SECURITY DEFINER RPCs callable by anonymous clients; every verdict uses the database clock. Expiry timestamps are computed by the server (`create_game_access_code`), never by the client.
- No anonymous table access; administrators read/write only through RLS with least-privilege column grants (hashes are never selected).

The end-user game console reuses the existing round engine (`generator` → `validation` → the single guarded `publishDemoRound` write → reveal) and the read-only `/m11` mirror — the Firebase contract and APP 2 are untouched.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Set the Supabase values in `.env` using the project configuration supplied for your deployment. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read by the browser. The publishable/anon key is safe for browser use; never put a service-role or secret key in a `VITE_*` variable or committed file. If either value is missing or a privileged key is detected, the sign-in screen reports that control-plane setup is required rather than attempting a login.

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=

# Existing Firebase bridge — keep the project and database URL unchanged.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=zaem-a8d30.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://zaem-a8d30-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=zaem-a8d30
VITE_FIREBASE_STORAGE_BUCKET=zaem-a8d30.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

The Supabase control plane must be configured and migrated before production sign-in is available. Create and confirm the intended Auth user through the Supabase dashboard or another trusted administrative channel. Then, from a trusted SQL session, use that user's exact Auth UUID (copied from Supabase, never guessed) to provision the first administrator:

```sql
insert into public.admin_users (id, email, username, role)
select id, email, 'primary-admin', 'super_admin'
from auth.users
where id = '<exact-auth-user-uuid>';
```

Do not put the user's password or any service credential in SQL or source control. `admin_users` is intentionally not self-enrolling: the first privileged account must be provisioned out of band, with `active = true` and the Auth UUID as the profile primary key.

## Supabase setup

The reproducible schema is in:

```text
supabase/migrations/20260902000000_magic_script_control_plane.sql
supabase/migrations/20260902000001_magic_script_least_privilege_grants.sql
supabase/migrations/20260902000002_game_access.sql
```

The third migration adds the Apple of Fortune end-user access system (`game_access_codes`, `game_access_sessions`, and the `create/redeem/check` RPCs) without changing any existing table.

The second migration tightens anonymous read columns, removes browser deletes for singleton public settings, and narrows browser insert columns for append-only records. Apply both with the Supabase CLI after linking the project:

```bash
supabase link --project-ref eeffakpnyhqoxgbpxelj
supabase db push
```

The optional server-side access-code verification function is in:

```text
supabase/functions/redeem-admin-code/index.ts
```

It uses `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function runtime. That key is never read by the Vite application.

### Schema

- `admin_users` — Supabase Auth-linked profiles, role, active state, and timestamps.
- `admin_codes` — SHA-256 code hashes, role, expiration, use limits, status, and creator.
- `site_settings` — typed general/announcement values with an explicit `is_public` flag.
- `social_links` — singleton Telegram and YouTube destinations.
- `display_settings` — online display enablement, random/fixed mode, range, fixed value, and refresh interval.
- `activity_logs` — append-only administrative actions and non-sensitive metadata.
- `round_history` — non-sensitive operational round records; never a money or wager ledger.
- `game_access_codes` — hashed, time-bound Apple of Fortune access codes (duration, server-computed expiry, revocation, last Account ID).
- `game_access_sessions` — hashed opaque session tokens bound to a code expiry; the only end-user authorization state.

All tables have timestamps, relevant constraints, and indexes. A shared trigger keeps `updated_at` consistent.

### RLS and permissions

Row Level Security is enabled on every table.

- Anonymous users may read only explicitly public settings, social links, and display settings.
- Active authenticated administrators can read their permitted control data.
- `super_admin` can manage administrator profiles and all control-plane areas.
- `admin` can manage normal settings, social/display configuration, codes, logs, and operational controls.
- `operator` can use the Game Console and review operational history/profile only.
- Codes cannot be created with `super_admin` role by a normal admin; the policy requires a super administrator for that escalation.
- Activity logs and round history are append-only from the browser. An actor may append only their own ID; no browser user can edit or delete logs.
- No policy grants anonymous insert, update, delete, permission changes, code creation, or admin management.

Frontend permission checks improve the interface, but every sensitive operation is also enforced by RLS.

### Auth and failure handling

The browser enables a persistent Supabase Auth session, resolves the Auth UUID to the matching `public.admin_users.id`, and requires `active = true` before rendering the workspace. A missing profile or inactive profile signs the Auth session out. Login and control-plane surfaces keep configuration, network, invalid-credential, unconfirmed-email, rate-limit, profile, insufficient-role, session, and database/RLS failures separate while showing only safe operational text.

The notification popover is intentionally limited to the announcement setting and temporary in-memory action feedback. The executed migration has no `notifications` table, so the client does not claim to provide persisted notification history.

## Admin code handling

The Admin Codes page supports:

- `1 hour`, `6 hours`, `12 hours`, `1 day`, `7 days`, `30 days`, or custom expiration;
- role selection, maximum uses, activation/deactivation, revoke, and deletion;
- creation/expiration/usage/status visibility;
- one-time copy of the newly generated plaintext code.

A code is generated with `crypto.getRandomValues` and hashed with Web Crypto SHA-256 before it is inserted. The raw code is held in React memory only long enough to copy it and is never placed in Supabase, activity metadata, or URL state. The browser inventory also omits the stored hash from its select projection. Verification belongs in the optional Edge Function, not in a client-side secret comparison.

## Settings and public links

General settings, social links, and display settings are loaded from Supabase through typed services and a shared settings hook. The authenticated shell footer automatically renders configured Telegram and YouTube buttons and hides an empty destination. The initial migration seeds Telegram with the requested `https://t.me/fox_script_vip` destination; administrators can replace it from the panel.

The online counter is explicitly a display value, not presence analytics. Administrators can control:

- enabled/hidden;
- random or fixed mode;
- minimum and maximum;
- fixed value;
- refresh interval.

The UI does not claim that this value represents verified traffic.

## Firebase safety contract

The existing service layer in `src/services/m11.ts` remains the only Firebase write path.

The hard contract is unchanged:

- fixed path `/m11`;
- exactly `m1` through `m50`;
- each child remains `{ "mN": "0" }` or `{ "mN": "1" }` with string values;
- one validated atomic `update()` for the explicit NEW GAME action;
- no writes to `/main`, `/xbetmoney`, `/users`, `/bet1`, or `/data`;
- read-only live observation remains in `useM11Mirror`;
- APP 2 and APK files are not modified.

The Game Console flow is still:

```text
NEW GAME → generate → validate → single existing Firebase publish → freeze → SHOW
LOAD LIVE ROUND → freeze the validated read-only snapshot → SHOW
```

Supabase records management metadata around those actions, but it never publishes `/m11` and React components never call Firebase write APIs directly.

## Project structure

```text
src/
  config/        Firebase and Supabase environment contracts
  types/         game and typed control-plane models
  services/      existing Firebase/m11 services + Supabase control services
  hooks/         Auth, route, settings, online display, and Firebase observers
  layouts/       authenticated shell and game-console shell
  components/    cyber UI primitives, navigation, grid, status, toast, dialogs
  pages/         Login, Dashboard, Game Console, History, Codes, Logs, Settings, Profile
supabase/
  migrations/    reproducible PostgreSQL schema, functions, indexes, RLS
  functions/    server-side code verification boundary
```

## Verification commands

```bash
npm run typecheck
npm run lint
npm run audit:firebase
npm test
npm run build
```

The Vite server binds to all interfaces and permits the Arena preview host. The responsive grid uses a constrained five-column layout with a narrow multiplier rail on phones; it is designed for 320px, 375px, 390px, 430px, tablet, and desktop widths without horizontal scrolling.

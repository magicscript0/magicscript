# MAGIC SCRIPT Admin Console

MAGIC SCRIPT is a dark, mobile-first operations console for the existing game visualization workflow.

The application deliberately keeps two backends separate:

```text
MAGIC SCRIPT UI ── Supabase ── administration, Auth, roles, settings, codes, logs, history
              └─ Firebase /m11 ── existing realtime round bridge ── APP 2 (unchanged)
```

Supabase never replaces Firebase. The existing Firebase project, `/m11` path, 50-child payload, and APP 2 consumer contract remain intact.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Set the Supabase values in `.env` using the project credentials supplied for your deployment. Only the publishable key belongs in the browser. Never put a service-role key in `VITE_*` variables or committed files.

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key

# Existing Firebase bridge — keep the project and database URL unchanged.
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

The Supabase control plane must be configured and migrated before production sign-in is available. Create an Auth user in Supabase, then provision the first administrator from a trusted SQL session:

```sql
insert into public.admin_users (id, email, username, role)
select id, email, 'primary-admin', 'super_admin'
from auth.users
where email = 'admin@example.com';
```

`admin_users` is intentionally not self-enrolling: the first privileged account must be provisioned out of band.

## Supabase setup

The reproducible schema is in:

```text
supabase/migrations/20260902000000_magic_script_control_plane.sql
```

Apply it with the Supabase CLI after linking the project:

```bash
supabase link --project-ref <project-ref>
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

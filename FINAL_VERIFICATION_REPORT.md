# MAGIC SCRIPT Supabase Runtime Verification

**Date:** 2026-09-02
**Branch:** `arena/01a0636a-magicscript`

## SUPABASE CONFIGURATION

**BLOCKED — secure publishable key is not available in this runtime.**

The repository now has the correct Supabase URL in `.env.example` and `README.md`. The browser reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the key is not hardcoded. No `.env` file, process variable, deployment configuration, or service-role key was found. The secure-environment selection did not populate the shell or Vite process.

The local `.env.example` intentionally leaves `VITE_SUPABASE_PUBLISHABLE_KEY` empty. `.env` remains ignored and was not committed.

## SUPABASE CONNECTION

**NOT VERIFIED — runtime configuration is missing.**

The checkout has no running Vite process at inspection time, no Vercel/Netlify configuration or CLI, and no CI deployment workflow. The available scripts are local `vite`, `vite preview`, and the production build. Therefore the reported site is currently only reproducible as a local Vite/Arena preview, not as a provider-managed deployment from this checkout.

No Supabase request was attempted without a publishable key. The application must be restarted/rebuilt after the secure variables are connected because Vite injects them at build time.

## AUTHENTICATION

**IMPLEMENTED IN CODE; LIVE FLOW NOT VERIFIED.**

The implementation uses Supabase Auth email/password login, obtains `data.user.id`, looks up the matching `public.admin_users.id`, requires `active = true`, persists/restores sessions, defers Auth-state work safely, and signs out missing/inactive/invalid-profile sessions.

A real login, Auth UUID, refresh restoration, or dashboard request could not be tested because the secure publishable key and an authenticated test account were unavailable.

## ADMIN AUTHORIZATION

**IMPLEMENTED AND STATICALLY REVIEWED; LIVE SUPER-ADMIN ACCESS NOT VERIFIED.**

The role model includes `super_admin`, `admin`, and `operator`. UI route permissions are role-aware, and unauthorized routes identify insufficient role access. Backend authorization remains enforced by the migration's RLS policies and helper functions; no frontend bypass was added.

## DATABASE/RLS

**MIGRATION FILES PRESENT; APPLICATION NOT VERIFIED FROM THIS RUNTIME.**

Both required files are present:

- `supabase/migrations/20260902000000_magic_script_control_plane.sql`
- `supabase/migrations/20260902000001_magic_script_least_privilege_grants.sql`

The typed services cover `admin_users`, roles, `admin_codes`, activity logs, round history, general settings, social links, display settings, profile data, and the existing in-memory notification/announcement surface. There is no `notifications` table in the migration, so no persisted notification behavior is falsely claimed.

The Supabase CLI is not installed, and no secure connection was available to confirm migration history or exercise representative RLS reads/writes. The first-admin path remains out-of-band: create/confirm the intended Auth user, then provision its exact Auth UUID as an active `super_admin` in a trusted SQL session. No credentials were guessed or printed.

## FIREBASE COMPATIBILITY

**PASS — unchanged contract.**

`npm run audit:firebase` passed with:

- one Firebase SDK mutation in `src/services/m11.ts`;
- one explicit publisher caller in the NEW GAME flow;
- fixed `/m11` path;
- fixed `m1` through `m50` children; and
- no forbidden-node writes or legacy Android write APIs elsewhere in `src`.

The Firebase project remains `zaem-a8d30` with its existing RTDB URL, payload shape, centralized writer, and APP 2 compatibility. No Firebase listener or writer implementation was changed.

## BUILD/TESTS

**PASS.**

After installing the repository dependencies, the required checks passed:

- `npm run typecheck`
- `npm run lint`
- `npm test` — 17 files, 148 tests
- `npm run audit:firebase`
- `npm run build`
- `git diff --check`

## REMAINING ACTIONS

1. Connect the publishable key through Arena's secure environment configuration as `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not paste it into chat, source, logs, `.env.example`, or the final report.
2. Set `VITE_SUPABASE_URL` to the supplied project URL in the same local/deployment environment.
3. Restart local Vite or rebuild/redeploy the provider-managed site.
4. Confirm the built site no longer shows “Supabase is not configured.”
5. Apply/confirm both migrations, provision the exact Auth UUID as an active `super_admin`, and run the live login/session/dashboard/RLS checks.

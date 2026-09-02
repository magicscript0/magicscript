# MAGIC SCRIPT Supabase Runtime Verification

**Date:** 2026-09-02
**Branch:** `arena/01a0636a-magicscript`

## SUPABASE CONFIGURATION

**PASS — local Vite runtime configured without committing credentials.**

The secure Arena process variables were not injected, so the ignored local `.env` was created as the permitted fallback. It contains the supplied Supabase URL and publishable key only; no service-role key is present. The key is not in source code, `.env.example`, logs, or this report. `git check-ignore` confirms `.env` is ignored.

The Vite SSR runtime validation returned `PASS`, the URL host is the supplied Supabase project, the publishable key was accepted, and the live Vite-transformed module contained the runtime configuration. `.env.example` contains placeholders only for Supabase values.

## SUPABASE CONNECTION

**FAIL — outbound Supabase TLS is blocked in this sandbox.**

The Vite development server restarted successfully on port 5173, and its transformed Supabase configuration loaded. A direct Auth settings request failed before an HTTP response with `SSL_ERROR_SYSCALL` / HTTP 000; an HTTPS request to an unrelated external host failed the same way. This is a sandbox network limitation, not an authentication bypass or an application configuration fallback.

The browser-facing preview no longer serves a configuration-missing state, and the Supabase client constructor initialized successfully locally. A live server response could not be obtained.

## AUTHENTICATION

**FAIL — live Auth flow not reachable.**

The implementation uses Supabase Auth email/password login, retrieves `data.user.id`, resolves the matching `public.admin_users.id`, requires `active = true`, persists/restores sessions, and signs out missing or inactive profiles. Live email/password login, session restoration, and Auth UUID retrieval could not be exercised because outbound TLS is unavailable and no test account was provisioned in this environment.

## ADMIN AUTHORIZATION

**FAIL — live authorization not reachable.**

The role model and client checks include `super_admin`, `admin`, and `operator`. RLS remains the backend enforcement boundary. Exact Auth UUID matching, `active = true`, and live `super_admin` authorization could not be confirmed without a reachable Supabase project and provisioned administrator.

## DATABASE/RLS

**FAIL — live database/RLS operations not reachable.**

Typed control-plane services and the RLS policies are present for administrator profiles, settings, social links, display settings, codes, activity logs, and round history. Representative reads/writes, unauthorized rejection, and inactive-user rejection could not be executed because the Supabase endpoint is unreachable from this sandbox. No RLS bypass or policy weakening was introduced.

## MIGRATIONS

**NOT VERIFIED.** Both required migration files are present. The Supabase CLI is unavailable, and the endpoint cannot be reached to inspect migration history:

- `supabase/migrations/20260902000000_magic_script_control_plane.sql`
- `supabase/migrations/20260902000001_magic_script_least_privilege_grants.sql`

## FIREBASE COMPATIBILITY

**PASS.** `npm run audit:firebase` confirms the existing Firebase project `zaem-a8d30`, RTDB contract, `/m11`, exact `m1`–`m50` children, centralized writer, and APP 2 listener compatibility remain intact. No second Firebase writer was introduced.

## BUILD/TESTS

**PASS.** The required checks completed successfully:

- `npm run typecheck`
- `npm run lint`
- `npm test` — 17 files, 148 tests passed
- `npm run audit:firebase`
- `npm run build`
- `git diff --check`

## REMAINING ACTIONS

1. Run the live Supabase checks from an environment with outbound HTTPS access: Auth login, session restoration, Auth UUID/profile matching, `active = true`, `super_admin` authorization, dashboard loading, representative RLS reads/writes, and unauthorized/inactive rejection.
2. Apply or inspect migration history for both listed migration files using a trusted Supabase CLI/dashboard connection.
3. Keep the ignored local `.env` out of version control and rotate/revoke the exposed publishable key if it was not intended to be shared in the chat message.

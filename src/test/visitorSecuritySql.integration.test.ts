// @vitest-environment node
/**
 * VISITOR & SECURITY MONITORING — database integration test.
 *
 * Runs the repository's ACTUAL Supabase migrations (including the new
 * 20260912000000_visitor_security_monitoring.sql) against an embedded
 * PostgreSQL (@electric-sql/pglite) in a Supabase-like environment:
 *
 *  - pgcrypto lives in the `extensions` schema (never `public`),
 *  - `anon` / `authenticated` / `service_role` roles and `auth.uid()` exist,
 *  - migrations are applied verbatim from supabase/migrations.
 *
 * Covered: visitor upsert + counters, server-side validation/normalization
 * (paths, reasons, country, account id, claimed user id), severity windows
 * (a single failure is NEVER an attack; repetition escalates), heartbeat
 * throttling, retention pruning authorization, admin-only RLS, and the
 * structural guarantee that no secret-bearing column exists at all.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const REPO_ROOT = join(__dirname, '..', '..')

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222'
const NOBODY_ID = '33333333-3333-3333-3333-333333333333'

const VISITOR_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const VISITOR_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const VISITOR_C = 'cccccccc-3333-4333-8333-cccccccccccc'
const CLAIMED_USER = 'dddddddd-4444-4444-8444-dddddddddddd'

interface TrackRow {
  event_id: string | null
  severity: 'normal' | 'warning' | 'suspicious' | 'high_risk'
  recent_failure_count: number
}

interface VisitorRow {
  id: string
  visitor_key: string
  user_id: string | null
  game_account_id: string | null
  first_seen_at: Date | string
  last_seen_at: Date | string
  session_count: number
  login_success_count: number
  login_failure_count: number
  country_code: string | null
  device_type: string
  browser: string | null
  os: string | null
  last_path: string | null
  referrer_host: string | null
}

interface EventRow {
  id: string
  visitor_key: string
  event_type: string
  result: string
  reason: string | null
  severity: string
  recent_failure_count: number
  user_id: string | null
  game_account_id: string | null
  country_code: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  path: string | null
  created_at: Date | string
}

let db: PGlite

async function rows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, values)
  return result.rows as T[]
}

async function setUid(uid: string | null): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['app.uid', uid ?? ''])
}

/** Calls the production RPC exactly like the browser tracking service does. */
async function track(params: {
  visitorKey?: string
  eventType: string
  path?: string | null
  reason?: string | null
  accountId?: string | null
  userId?: string | null
  newSession?: boolean
  countryCode?: string | null
  deviceType?: string
  browser?: string | null
  os?: string | null
  referrerHost?: string | null
}): Promise<TrackRow> {
  const result = await rows<TrackRow>(
    `select * from public.track_visitor_activity(
       $1::uuid, $2::public.security_event_type, $3, $4, $5,
       $6::uuid, $7, $8, $9::public.visitor_device_type, $10, $11, $12
     )`,
    [
      params.visitorKey ?? VISITOR_A,
      params.eventType,
      params.path ?? null,
      params.reason ?? null,
      params.accountId ?? null,
      params.userId ?? null,
      params.newSession ?? false,
      params.countryCode ?? null,
      params.deviceType ?? 'unknown',
      params.browser ?? null,
      params.os ?? null,
      params.referrerHost ?? null,
    ],
  )
  return result[0]
}

async function visitor(key = VISITOR_A): Promise<VisitorRow | undefined> {
  const found = await rows<VisitorRow>('select * from public.visitor_sessions where visitor_key = $1::uuid', [key])
  return found[0]
}

async function events(key = VISITOR_A): Promise<EventRow[]> {
  return rows<EventRow>(
    'select * from public.security_events where visitor_key = $1::uuid order by created_at asc, id asc',
    [key],
  )
}

async function expectSqlError(statement: string, values: unknown[], expected: { code?: string; message?: string }): Promise<void> {
  try {
    await db.query(statement, values)
    expect.unreachable(`expected the statement to fail (${statement})`)
  } catch (error) {
    const err = error as { code?: string; message?: string }
    if (expected.code) expect(err.code).toBe(expected.code)
    if (expected.message) expect(err.message).toContain(expected.message)
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })

  // --- Supabase-shaped environment -----------------------------------------
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;  -- Supabase keeps pgcrypto OUT of public
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid', true), '')::uuid $$;
  `)

  // --- The repo's REAL migrations, verbatim, in production order ------------
  for (const file of [
    '20260902000000_magic_script_control_plane.sql',
    '20260902000001_magic_script_least_privilege_grants.sql',
    '20260902000002_game_access.sql',
    '20260910000000_public_game_control.sql',
    '20260910120000_game_access_verification_fix.sql',
    '20260912000000_visitor_security_monitoring.sql',
  ]) {
    await db.exec(readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8'))
  }

  // --- Administrators ---------------------------------------------------------
  for (const [id, role] of [[ADMIN_ID, 'admin'], [OPERATOR_ID, 'operator']] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@example.com`])
    await db.query('insert into public.admin_users (id, email, role, active) values ($1, $2, $3, true)', [id, `${id}@example.com`, role])
  }
  await db.query('insert into auth.users (id, email) values ($1, $2)', [NOBODY_ID, `${NOBODY_ID}@example.com`])
}, 240_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('reset role')
  await setUid(null)
  // Fresh monitoring state per test (postgres bypasses RLS for maintenance).
  await db.exec('truncate public.security_events, public.visitor_sessions restart identity')
})

describe('visitor/session creation and last-active updates', () => {
  it('creates a pseudonymous visitor profile on the first tracked event', async () => {
    await track({
      eventType: 'session_start',
      path: '/',
      newSession: true,
      countryCode: 'de',
      deviceType: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      referrerHost: 't.co',
    })

    const profile = await visitor()
    expect(profile).toBeDefined()
    expect(profile!.visitor_key).toBe(VISITOR_A)
    expect(profile!.session_count).toBe(1)
    expect(profile!.user_id).toBeNull()
    expect(profile!.game_account_id).toBeNull()
    // Country is normalized to uppercase ISO-3166 alpha-2.
    expect(profile!.country_code).toBe('DE')
    expect(profile!.device_type).toBe('mobile')
    expect(profile!.browser).toBe('Chrome')
    expect(profile!.os).toBe('Android')
    expect(profile!.last_path).toBe('/')
    expect(profile!.referrer_host).toBe('t.co')
    expect(Date.parse(String(profile!.first_seen_at))).toBeGreaterThan(Date.now() - 60_000)

    const log = await events()
    expect(log).toHaveLength(1)
    expect(log[0].event_type).toBe('session_start')
    expect(log[0].result).toBe('info')
    expect(log[0].severity).toBe('normal')
  })

  it('upserts the same visitor: first_seen is kept, last_seen and metadata advance', async () => {
    await track({ eventType: 'session_start', path: '/', newSession: true, deviceType: 'desktop', browser: 'Firefox', os: 'Linux' })
    const first = await visitor()

    await track({ eventType: 'page_view', path: '/play', deviceType: 'desktop' })
    const second = await visitor()

    expect(second!.id).toBe(first!.id)
    expect(String(second!.first_seen_at)).toBe(String(first!.first_seen_at))
    expect(Date.parse(String(second!.last_seen_at))).toBeGreaterThanOrEqual(Date.parse(String(first!.last_seen_at)))
    expect(second!.session_count).toBe(1) // no new session claimed
    expect(second!.last_path).toBe('/play')

    // A new browser session increments the counter.
    await track({ eventType: 'session_start', path: '/', newSession: true, deviceType: 'desktop' })
    expect((await visitor())!.session_count).toBe(2)
  })

  it('throttles the heartbeat server-side and never writes event rows for it', async () => {
    await track({ eventType: 'session_start', path: '/', newSession: true })

    // last_seen was just refreshed → the 20-second guard rejects the ping.
    const throttled = await rows<{ accepted: boolean }>('select public.visitor_heartbeat($1::uuid) as accepted', [VISITOR_A])
    expect(throttled[0].accepted).toBe(false)

    await db.query("update public.visitor_sessions set last_seen_at = timezone('utc', now()) - interval '30 seconds' where visitor_key = $1::uuid", [VISITOR_A])
    const accepted = await rows<{ accepted: boolean }>('select public.visitor_heartbeat($1::uuid) as accepted', [VISITOR_A])
    expect(accepted[0].accepted).toBe(true)

    const refreshed = await visitor()
    expect(Date.parse(String(refreshed!.last_seen_at))).toBeGreaterThan(Date.now() - 10_000)
    expect(await events()).toHaveLength(1) // only the original session_start
  })

  it('dedupes rapid identical session_start/page_view events into presence updates', async () => {
    await track({ eventType: 'page_view', path: '/', newSession: true })
    const dup = await track({ eventType: 'page_view', path: '/' })
    expect(dup.event_id).toBeNull()
    expect(await events()).toHaveLength(1)
  })
})

describe('server-side validation and normalization', () => {
  it('stores only whitelisted app paths (query strings never survive)', async () => {
    await track({ eventType: 'page_view', path: '/admin#/visitors?secret=1' })
    const log = await events()
    expect(log[0].path).toBeNull()
    expect((await visitor())!.last_path).toBeNull()

    await track({ eventType: 'page_view', path: '/login/admin' })
    const all = await events()
    expect(all[all.length - 1]!.path).toBe('/login/admin')
  })

  it('maps unknown failure reasons to the generic category', async () => {
    await track({ eventType: 'game_login_failure', reason: 'the code they typed was MS-HUNTER2' })
    const log = await events()
    expect(log[0].reason).toBe('unknown')
    expect(JSON.stringify(log[0]).toLowerCase()).not.toContain('hunter2')
  })

  it('accepts only 9–11 digit Account IDs and rejects malformed countries', async () => {
    await track({ eventType: 'game_login_failure', accountId: 'abc123', countryCode: 'Germany', reason: 'invalid_account' })
    const log = await events()
    expect(log[0].game_account_id).toBeNull()
    expect(log[0].country_code).toBeNull()
    expect(log[0].reason).toBe('invalid_account')

    await track({ eventType: 'game_login_success', accountId: '12345678901', countryCode: 'us' })
    const allEvents = await events()
    const success = allEvents[allEvents.length - 1]!
    expect(success.game_account_id).toBe('12345678901')
    expect(success.country_code).toBe('US')
    expect((await visitor())!.game_account_id).toBe('12345678901')
  })

  it('drops a claimed user id that does not match the authenticated JWT', async () => {
    // Anonymous caller claims an admin uuid → ignored.
    await track({ eventType: 'admin_login_success', userId: CLAIMED_USER })
    const claimed = await events()
    expect(claimed[claimed.length - 1]!.user_id).toBeNull()
    expect((await visitor())!.user_id).toBeNull()

    // Authenticated caller claiming its OWN uid → linked. (The auth.users
    // row is provisioned while still superuser, before the role switch.)
    await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [CLAIMED_USER, 'claimed@example.com'])
    await db.exec('set role authenticated')
    await setUid(CLAIMED_USER)
    await track({ visitorKey: VISITOR_B, eventType: 'admin_login_success', userId: CLAIMED_USER })
    // Read back as superuser: the claimed user is no admin, so RLS would
    // (correctly) hide the monitoring row from its own test assertion.
    await db.exec('reset role')
    expect((await visitor(VISITOR_B))!.user_id).toBe(CLAIMED_USER)
  })

  it('rejects malformed visitor keys and unknown event types at the SQL boundary', async () => {
    await expectSqlError(
      'select * from public.track_visitor_activity($1::uuid, $2::public.security_event_type)',
      ['not-a-uuid', 'session_start'],
      { code: '22P02' },
    )
    await expectSqlError(
      'select * from public.track_visitor_activity($1::uuid, $2::public.security_event_type)',
      [VISITOR_A, 'password_captured'],
      { code: '22P02' },
    )
  })
})

describe('authentication events and counters', () => {
  it('records a successful game login with result=success and increments the counter', async () => {
    const result = await track({ eventType: 'game_login_success', path: '/', accountId: '123456789' })
    expect(result.severity).toBe('normal')
    const log = await events()
    expect(log[0].result).toBe('success')
    expect(log[0].reason).toBeNull()
    const profile = await visitor()
    expect(profile!.login_success_count).toBe(1)
    expect(profile!.login_failure_count).toBe(0)
  })

  it('records a failed game login with a category only — never the submitted secret', async () => {
    const result = await track({ eventType: 'game_login_failure', reason: 'invalid_code', accountId: '123456789' })
    expect(result.severity).toBe('normal') // a single failure is NOT an attack
    expect(result.recent_failure_count).toBe(1)
    const log = await events()
    expect(log[0].result).toBe('failure')
    expect(log[0].reason).toBe('invalid_code')
    expect((await visitor())!.login_failure_count).toBe(1)
  })

  it('records expired and revoked game access attempts as failures with categories', async () => {
    await track({ eventType: 'game_access_expired', reason: 'access_expired', accountId: '123456789' })
    await track({ eventType: 'game_access_revoked', reason: 'access_revoked', accountId: '123456789' })
    const log = await events()
    expect(log.map((entry) => [entry.event_type, entry.result, entry.reason])).toEqual([
      ['game_access_expired', 'failure', 'access_expired'],
      ['game_access_revoked', 'failure', 'access_revoked'],
    ])
    // These are access failures, not login attempts: login counters stay put.
    expect((await visitor())!.login_failure_count).toBe(0)
  })
})

describe('suspicious activity detection (server-computed severity)', () => {
  it('escalates repeated failures by the same visitor within the window', async () => {
    const severities: string[] = []
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = await track({ eventType: 'game_login_failure', reason: 'invalid_code', accountId: '999888777' })
      severities.push(result.severity)
      expect(result.recent_failure_count).toBe(attempt)
    }
    expect(severities[0]).toBe('normal')      // 1 failure → never an attack
    expect(severities[1]).toBe('warning')     // 2 → warning
    expect(severities[3]).toBe('suspicious')  // 4 → suspicious
    expect(severities[9]).toBe('high_risk')   // 10 → high-risk/repeated activity
  })

  it('flags repeated failures against the same account across different visitors', async () => {
    await track({ visitorKey: VISITOR_A, eventType: 'game_login_failure', reason: 'invalid_code', accountId: '444555666' })
    await track({ visitorKey: VISITOR_B, eventType: 'game_login_failure', reason: 'invalid_code', accountId: '444555666' })
    const third = await track({ visitorKey: VISITOR_C, eventType: 'game_login_failure', reason: 'unavailable', accountId: '444555666' })

    // Visitor C failed once itself, but the account has now been hit 3 times.
    expect(third.recent_failure_count).toBe(1)
    expect(third.severity).toBe('warning')

    const stored = await events(VISITOR_C)
    expect(stored[0].severity).toBe('warning')
  })

  it('ignores failures that aged out of the 15-minute window', async () => {
    await track({ eventType: 'game_login_failure', reason: 'invalid_code' })
    await track({ eventType: 'game_login_failure', reason: 'invalid_code' })
    await db.query("update public.security_events set created_at = timezone('utc', now()) - interval '20 minutes' where visitor_key = $1::uuid", [VISITOR_A])

    const fresh = await track({ eventType: 'game_login_failure', reason: 'invalid_code' })
    expect(fresh.recent_failure_count).toBe(1)
    expect(fresh.severity).toBe('normal')
  })

  it('detects rapid repeated requests (event flood) as suspicious', async () => {
    await track({ eventType: 'session_start', path: '/', newSession: true })
    const profile = await visitor()
    // Simulate a scripted client hammering the RPC: 29 stored events already.
    for (let index = 0; index < 29; index += 1) {
      await db.query(
        `insert into public.security_events (visitor_id, visitor_key, event_type, result, path)
         values ($1::uuid, $2::uuid, 'page_view', 'info', '/play')`,
        [profile!.id, VISITOR_A],
      )
    }
    const flooded = await track({ eventType: 'game_logout', path: '/play' })
    expect(flooded.severity).toBe('suspicious')
  })

  it('keeps informational events at normal severity even with failures in the window', async () => {
    await track({ eventType: 'game_login_failure', reason: 'invalid_code' })
    await track({ eventType: 'game_login_failure', reason: 'invalid_code' })
    const pageView = await track({ eventType: 'page_view', path: '/play' })
    expect(pageView.severity).toBe('normal')
  })
})

describe('privacy guarantees at the schema level', () => {
  it('has no column able to hold a password, token, code, cookie, or IP', async () => {
    const columns = await rows<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name in ('visitor_sessions', 'security_events')`,
    )
    expect(columns.length).toBeGreaterThan(25)
    const forbidden = /(password|passwd|token|secret|cookie|authorization|credential|ip_addr|ip_address|\bip\b)/i
    for (const column of columns) {
      expect(column.column_name).not.toMatch(forbidden)
      expect(['code', 'access_code', 'plain_code', 'hash', 'code_hash', 'token_hash'].includes(column.column_name)).toBe(false)
    }
  })

  it('exposes no RPC parameter that could carry a secret', async () => {
    const params = await rows<{ proname: string; arg: string }>(
      `select p.proname, unnest(coalesce(
         (select array_agg(x) from unnest(p.proargnames) as x),
         '{}'::text[])) as arg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('track_visitor_activity', 'visitor_heartbeat', 'prune_security_monitoring')`,
    )
    // 'p_country_code' and 'p_account_id' are approximate-location and
    // identifier metadata by design; credentials and network identifiers
    // have no parameter at all.
    const forbidden = /(password|passwd|token|secret|cookie|authoriz|credential|access_code|plain|(^|_)ip($|_))/i
    for (const param of params) {
      expect(param.arg).not.toMatch(forbidden)
      if (param.arg.includes('code')) expect(param.arg).toBe('p_country_code')
    }
  })

  it('stores failure events without any free-form user text', async () => {
    await track({ eventType: 'admin_login_failure', reason: 'invalid_credentials' })
    const log = await events()
    const serialized = JSON.stringify(log[0])
    expect(serialized).not.toMatch(/password/i)
    expect(log[0].reason).toBe('invalid_credentials')
  })
})

describe('RLS and grants — admin-only access', () => {
  beforeEach(async () => {
    await track({ visitorKey: VISITOR_A, eventType: 'session_start', path: '/', newSession: true })
    await track({ visitorKey: VISITOR_A, eventType: 'game_login_failure', reason: 'invalid_code' })
  })

  it('denies anonymous clients any direct table access', async () => {
    await db.exec('set role anon')
    await expectSqlError('select * from public.visitor_sessions', [], { code: '42501' })
    await expectSqlError('select * from public.security_events', [], { code: '42501' })
    await expectSqlError(
      "insert into public.security_events (visitor_id, visitor_key, event_type, result) values (gen_random_uuid(), $1::uuid, 'page_view', 'info')",
      [VISITOR_A],
      { code: '42501' },
    )
  })

  it('lets anonymous clients use the tracking RPCs (the only write path)', async () => {
    await db.exec('set role anon')
    const result = await rows<TrackRow>(
      `select * from public.track_visitor_activity(
         $1::uuid, $2::public.security_event_type, $3, null, null, null, false, null, 'desktop', null, null, null)`,
      [VISITOR_B, 'page_view', '/play'],
    )
    expect(result[0].severity).toBe('normal')
  })

  it('returns zero rows to a signed-in non-admin (RLS), not an error', async () => {
    await db.exec('set role authenticated')
    await setUid(NOBODY_ID)
    const visibleVisitors = await rows<unknown>('select * from public.visitor_sessions')
    const visibleEvents = await rows<unknown>('select * from public.security_events')
    expect(visibleVisitors).toHaveLength(0)
    expect(visibleEvents).toHaveLength(0)
    // Direct writes are impossible even for a signed-in non-admin.
    await expectSqlError(
      "insert into public.security_events (visitor_id, visitor_key, event_type, result) values (gen_random_uuid(), $1::uuid, 'page_view', 'info')",
      [VISITOR_A],
      { code: '42501' },
    )
  })

  it('gives administrators read access while operators stay out (RLS)', async () => {
    await db.exec('set role authenticated')
    await setUid(OPERATOR_ID)
    expect(await rows<unknown>('select * from public.visitor_sessions')).toHaveLength(0)
    expect(await rows<unknown>('select * from public.security_events')).toHaveLength(0)

    await setUid(ADMIN_ID)
    expect(await rows<unknown>('select * from public.visitor_sessions')).toHaveLength(1)
    expect(await rows<unknown>('select * from public.security_events')).toHaveLength(2)
    // Reads are possible, but the audit trail stays append-only in practice:
    // no UPDATE/DELETE grant exists for authenticated administrators.
    await expectSqlError("update public.security_events set severity = 'normal'", [], { code: '42501' })
    await expectSqlError('delete from public.security_events', [], { code: '42501' })
  })

  it('hides deactivated administrators (profile gate is live)', async () => {
    await db.query('update public.admin_users set active = false where id = $1', [ADMIN_ID])
    await db.exec('set role authenticated')
    await setUid(ADMIN_ID)
    expect(await rows<unknown>('select * from public.security_events')).toHaveLength(0)
    // Reactivate as superuser: an authenticated admin cannot update profiles
    // (that path is super_admin-only by existing RLS).
    await db.exec('reset role')
    await db.query('update public.admin_users set active = true where id = $1', [ADMIN_ID])
  })
})

describe('retention / cleanup', () => {
  it('prunes only for administrators and only within sane retention bounds', async () => {
    await track({ visitorKey: VISITOR_A, eventType: 'session_start', path: '/', newSession: true })
    await db.query("update public.security_events set created_at = timezone('utc', now()) - interval '120 days' where visitor_key = $1::uuid", [VISITOR_A])
    await db.query("update public.visitor_sessions set last_seen_at = timezone('utc', now()) - interval '120 days', first_seen_at = timezone('utc', now()) - interval '120 days' where visitor_key = $1::uuid", [VISITOR_A])
    await track({ visitorKey: VISITOR_B, eventType: 'session_start', path: '/', newSession: true })

    // Operator role is not enough for destructive maintenance.
    await db.exec('set role authenticated')
    await setUid(OPERATOR_ID)
    await expectSqlError('select * from public.prune_security_monitoring(90)', [], { code: '42501' })

    await setUid(ADMIN_ID)
    await expectSqlError('select * from public.prune_security_monitoring(1)', [], { code: '22023', message: 'INVALID_RETENTION' })
    await expectSqlError('select * from public.prune_security_monitoring(1000)', [], { code: '22023', message: 'INVALID_RETENTION' })

    const pruned = await rows<{ events_deleted: number | bigint; visitors_deleted: number | bigint }>('select * from public.prune_security_monitoring(90)')
    expect(Number(pruned[0].events_deleted)).toBe(1)
    expect(Number(pruned[0].visitors_deleted)).toBe(1)

    // The fresh visitor and its events remain untouched.
    expect(await visitor(VISITOR_A)).toBeUndefined()
    expect(await visitor(VISITOR_B)).toBeDefined()
    expect(await events(VISITOR_B)).toHaveLength(1)
  })
})
